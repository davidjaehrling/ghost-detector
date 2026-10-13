/**
 * Procedural audio on react-native-audio-api (Web Audio shape). Graph, levels and
 * timing come from config.ts and scheduler.ts; this file only wires nodes.
 *
 *   geigerBus  -\
 *   humBus->LP --+-> sceneMix -> duckGain -> limiter(WaveShaper) -> destination
 *   staticBus  -/                               ^
 *   scareBus, cueBus --------------------------+  (bypass duckGain and sceneMix)
 *
 * The library has no DynamicsCompressorNode (0.13.x), so the -6 dBFS ceiling is a
 * WaveShaper soft clip. Unverified on device: see README.md.
 */
import type { AudioBuffer, AudioContext, AudioNode, AudioParam, BiquadFilterNode, GainNode, OscillatorNode } from 'react-native-audio-api';
import { mulberry32 } from '../engine/rng';
import { DEFAULT_CONFIG, dbToLin, humF0, type Intensity, type SoundConfig, type Tier } from './config';
import { limiterCurve, renderClick, renderNoise, renderScareNoise, renderThump } from './dsp';
import {
  GLIDE_S,
  PHASE_RATE_FRAC,
  baseRate,
  breakthroughAtPhase,
  createClickScheduler,
  fluxRate,
  geigerLevelDb,
  glideAt,
  graticuleCrossings,
  humLevelDb,
  humLowpassHz,
  scanRate,
  staticLevelDb,
  variantDurationsMs,
  wobble,
  type ClickEvent,
  type Glide,
  type ScanPhase,
} from './scheduler';
import type { AudioEngine, EngineHooks } from './types';

type AudioApi = { AudioContext: new (o?: { sampleRate?: number }) => AudioContext };
export interface EngineDeps {
  loadAudio?: () => AudioApi;
  seed?: number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (h: unknown) => void;
}

export const __audioLog = (): readonly never[] => [];

const LOOKAHEAD_S = 0.1;
const TICK_MS = 25;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const defaultLoad = (): AudioApi => require('react-native-audio-api') as AudioApi;

type Mode = 'idle' | 'view' | 'scan' | 'hold';

export function createAudioEngine(config: SoundConfig = DEFAULT_CONFIG, hooks: EngineHooks = {}, deps: EngineDeps = {}): AudioEngine {
  const cfg = config;
  const seed = deps.seed ?? 0x9e3779b1;
  const rng = mulberry32(seed ^ 0x51ed);
  const setIv = deps.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clearIv = deps.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));

  let ctx: AudioContext | null = null;
  let timer: unknown = null;
  let mode: Mode = 'idle';
  let tier: Tier = 'quiet';
  let intensity: Intensity = 'standard';
  let reduced = cfg.accessibility.reducedFlash;
  let flux = 0;
  let baseline: number | null = null;
  let lastFluxT = 0;
  let glide: Glide = { from: 0, to: 0, startT: 0, durS: 0 };
  let frac = 0; // scan level fraction for hum and static
  let faded = false;
  let sched = createClickScheduler(cfg, seed);
  let smearUntil = 0;
  let staticOffUntil = 0;
  let breakUntil = 0;

  // Nodes, created in build().
  let geigerBus: GainNode, humBus: GainNode, humLP: BiquadFilterNode, staticBus: GainNode, pinkG: GainNode, whiteG: GainNode;
  let staticBP: BiquadFilterNode, sceneMix: GainNode, duckGain: GainNode, cueBus: GainNode, scareBus: GainNode;
  let humGains: GainNode[] = [];
  let humOscs: OscillatorNode[] = [];
  let smearG: GainNode;
  let variants: AudioBuffer[] = [];
  let thump: AudioBuffer, scareNoise: AudioBuffer;
  let staticLfoHz = 0.7;
  let humPhase = 0;

  const buf = (data: Float32Array): AudioBuffer => {
    const b = ctx!.createBuffer(1, data.length, cfg.sampleRate);
    b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    return b;
  };
  const gain = (v: number, to?: AudioNode): GainNode => {
    const g = ctx!.createGain();
    g.gain.value = v;
    if (to) g.connect(to);
    return g;
  };
  const cap = () => baseRate(cfg, 'critical', intensity);
  const rate0 = () => baseRate(cfg, tier, intensity);

  function build() {
    const api = (deps.loadAudio ?? defaultLoad)();
    ctx = new api.AudioContext({ sampleRate: cfg.sampleRate });
    const c = ctx;
    const limiter = c.createWaveShaper();
    limiter.curve = limiterCurve(dbToLin(cfg.masterCeilingDbfs)) as Float32Array<ArrayBuffer>;
    limiter.connect(c.destination);
    duckGain = gain(1, limiter);
    sceneMix = gain(0, duckGain);
    cueBus = gain(1, limiter);
    scareBus = gain(1, limiter);
    geigerBus = gain(1, sceneMix);

    humLP = c.createBiquadFilter();
    humLP.type = 'lowpass';
    humLP.frequency.value = cfg.hum.lowpassHz[0];
    humLP.connect(sceneMix);
    humBus = gain(0, humLP);
    const f0 = humF0(cfg);
    cfg.hum.harmonics.forEach((h) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f0 * h.mul + (h.mul === 3 ? cfg.hum.detuneHz : 0);
      const g = gain(dbToLin(h.db) / cfg.hum.harmonics.length, humBus);
      o.connect(g);
      o.start();
      humOscs.push(o);
      humGains.push(g);
    });
    humPhase = rng() * Math.PI * 2;

    staticBP = c.createBiquadFilter();
    staticBP.type = 'bandpass';
    staticBP.frequency.value = cfg.static.centreHz.quiet;
    staticBP.Q.value = cfg.static.q.quiet;
    staticBP.connect(sceneMix);
    staticBus = gain(0, staticBP);
    pinkG = gain(1, staticBus);
    whiteG = gain(0, staticBus);
    for (const [pink, g] of [[true, pinkG], [false, whiteG]] as const) {
      const s = c.createBufferSource();
      s.buffer = buf(renderNoise(cfg.sampleRate, 2, pink, seed + (pink ? 1 : 2)));
      s.loop = true;
      s.connect(g);
      s.start();
    }
    staticLfoHz = cfg.static.lfoHz[0] + rng() * (cfg.static.lfoHz[1] - cfg.static.lfoHz[0]);

    // Breakthrough smear: two detuned sines, gated in the tick.
    smearG = gain(0, sceneMix);
    for (const hz of cfg.breakthrough.smearHz) {
      const o = c.createOscillator();
      o.frequency.value = hz;
      o.connect(smearG);
      o.start();
    }

    variants = variantDurationsMs(cfg.geiger.clickMs).map((ms, i) => buf(renderClick(cfg, ms, seed + 10 + i)));
    thump = buf(renderThump(cfg));
    scareNoise = buf(renderScareNoise(cfg, seed + 99));
  }

  const cueClick = (t: number, db: number, playbackRate = 1, variant = 3, bus: GainNode = cueBus) => {
    const s = ctx!.createBufferSource();
    s.buffer = variants[variant]!;
    s.playbackRate.value = playbackRate;
    s.connect(gain(dbToLin(db), bus));
    s.start(t);
  };

  function playClick(ev: ClickEvent, rate: number) {
    const s = ctx!.createBufferSource();
    s.buffer = variants[ev.variant % variants.length]!;
    s.playbackRate.value = ev.playbackRate;
    s.connect(gain(dbToLin(geigerLevelDb(cfg, rate, cap()) + ev.gainDb), geigerBus));
    s.start(ev.t);
  }

  const smooth = (p: AudioParam, v: number, now: number, tc = 0.05) => p.setTargetAtTime(v, now, tc);

  function currentRate(t: number): number {
    if (mode === 'hold' || mode === 'idle') return 0;
    const w = cfg.geiger.wobblePct[tier];
    let r: number;
    if (mode === 'scan') r = glideAt(glide, t);
    else r = fluxRate(cfg, rate0(), flux, baseline ?? flux, cap());
    return Math.min(cap(), Math.max(0, r * (1 + w * wobble(t, seed))));
  }

  function levels(now: number) {
    if (!ctx) return;
    const f = mode === 'scan' ? frac : 1;
    const inBreak = now < breakUntil;
    // Hum: level, drift, tremolo, brightness.
    const trem = Math.sin(2 * Math.PI * cfg.hum.tremoloHz * now + humPhase) * cfg.hum.tremoloDb;
    const drift = Math.sin(2 * Math.PI * cfg.hum.driftHz * now + humPhase) * 1.0;
    const off = mode === 'hold' || mode === 'idle';
    smooth(humBus.gain, off ? 0 : dbToLin(humLevelDb(cfg, tier, f) + trem + drift), now, mode === 'view' ? 0.25 : 0.05);
    smooth(humLP.frequency, humLowpassHz(cfg, tier, f), now, 0.25);
    // Static: level, crossfade pink/white, centre LFO and Q.
    const white = tier === 'strong' || tier === 'critical';
    smooth(pinkG.gain, white ? 0 : 1, now, 0.1);
    smooth(whiteG.gain, white ? 1 : 0, now, 0.1);
    let sdb = staticLevelDb(cfg, tier, f) + (inBreak ? cfg.breakthrough.openDb : 0);
    if (tier === 'critical' && inBreak) sdb += 4;
    const dropped = now < staticOffUntil;
    smooth(staticBus.gain, off || dropped ? 0 : dbToLin(sdb), now, dropped ? 0.005 : 0.05);
    const narrow = inBreak && now >= breakUntil - cfg.breakthrough.durationMs / 1000;
    const centre = narrow ? cfg.breakthrough.narrowHz : cfg.static.centreHz[tier] * (1 + cfg.static.lfoDepth * Math.sin(2 * Math.PI * staticLfoHz * now));
    smooth(staticBP.frequency, centre, now, 0.03);
    smooth(staticBP.Q, narrow ? cfg.breakthrough.narrowQ : inBreak ? cfg.breakthrough.openQ : cfg.static.q[tier], now, 0.03);
    // Smear: gated by a fast random level so it sits inside the noise.
    const sActive = now < smearUntil && !off;
    smooth(smearG.gain, sActive ? dbToLin(cfg.breakthrough.smearDbfs) * (0.35 + 0.65 * rng()) : 0, now, 0.02);
  }

  function tick() {
    if (!ctx || mode === 'idle') return;
    const now = ctx.currentTime;
    levels(now);
    if (mode === 'hold') {
      sched.reset(now + LOOKAHEAD_S);
      return;
    }
    for (const ev of sched.advance(now + LOOKAHEAD_S, currentRate)) {
      if (ev.t >= now) playClick(ev, currentRate(ev.t));
    }
  }

  function ensure() {
    if (!ctx) {
      build();
      sched = createClickScheduler(cfg, seed, ctx!.currentTime);
    }
  }

  return {
    start() {
      ensure();
      void ctx!.resume();
      if (mode === 'idle') mode = 'view';
      const now = ctx!.currentTime;
      sceneMix.gain.cancelScheduledValues(now);
      sceneMix.gain.setValueAtTime(faded ? sceneMix.gain.value : 0, now);
      sceneMix.gain.linearRampToValueAtTime(1, now + cfg.cues.fadeInMs / 1000);
      faded = true;
      sched.reset(now);
      if (timer === null) timer = setIv(tick, TICK_MS);
    },
    stop() {
      if (!ctx || mode === 'idle') return;
      const now = ctx.currentTime;
      sceneMix.gain.cancelScheduledValues(now);
      sceneMix.gain.setValueAtTime(sceneMix.gain.value, now);
      sceneMix.gain.linearRampToValueAtTime(0, now + 0.1);
      if (timer !== null) clearIv(timer);
      timer = null;
      mode = 'idle';
      void ctx.suspend();
    },
    setTier(t) {
      tier = t;
    },
    setIntensity(i) {
      intensity = i;
    },
    setFlux(mG) {
      if (!ctx || mode === 'hold') {
        flux = mG;
        return;
      }
      const now = ctx.currentTime;
      const dt = Math.max(0, now - lastFluxT);
      baseline = baseline === null ? mG : baseline + (mG - baseline) * (1 - Math.exp(-dt / 3));
      lastFluxT = now;
      const n = graticuleCrossings(flux, mG, cfg.geiger.graticuleMg);
      flux = mG;
      if (n > 0 && mode === 'view') {
        sched.burst(now + 0.01, Math.min(n, 3), Math.max(rate0(), 4));
        hooks.onNeedleTick?.();
      }
    },
    scanPhase(phase: ScanPhase) {
      ensure();
      if (!ctx) return;
      const now = ctx.currentTime;
      if (phase === 0 || mode === 'view' || mode === 'idle') {
        mode = 'scan';
        if (timer === null) timer = setIv(tick, TICK_MS);
        void ctx.resume();
        if (phase === 0) {
          cueClick(now, cfg.cues.relayDbfs, 0.5, 3);
          glide = { from: scanRate(cfg, tier, intensity, 0), to: scanRate(cfg, tier, intensity, 0), startT: now, durS: 0 };
          duckGain.gain.cancelScheduledValues(now);
          duckGain.gain.setValueAtTime(1, now);
        }
      }
      if (mode !== 'scan') return;
      frac = PHASE_RATE_FRAC[phase] ?? 1;
      glide = { from: glideAt(glide, now), to: scanRate(cfg, tier, intensity, frac), startT: now, durS: GLIDE_S };
      if (phase === 1 || phase === 2) cueClick(now, cfg.cues.keyTickDbfs, 1.4, 1);
      if (breakthroughAtPhase(tier, intensity, phase)) {
        const b = cfg.breakthrough;
        breakUntil = now + (b.openMs + b.durationMs) / 1000;
        smearUntil = now + b.smearMs / 1000;
      }
    },
    hold() {
      if (!ctx || mode === 'idle') return;
      const now = ctx.currentTime;
      mode = 'hold';
      duckGain.gain.cancelScheduledValues(now);
      duckGain.gain.setValueAtTime(duckGain.gain.value, now);
      duckGain.gain.linearRampToValueAtTime(0, now + cfg.cues.duckMs / 1000);
    },
    reveal() {
      if (!ctx || mode === 'idle') return;
      const now = ctx.currentTime;
      const s = ctx.createBufferSource();
      s.buffer = thump;
      s.connect(gain(dbToLin(cfg.cues.thumpDbfs), cueBus));
      s.start(now);
      cueClick(now + cfg.cues.thumpMs / 1000, cfg.cues.relayDbfs, 0.5, 3);
      mode = 'view';
      frac = 1;
      sceneMix.gain.cancelScheduledValues(now);
      sceneMix.gain.setValueAtTime(0, now);
      sceneMix.gain.linearRampToValueAtTime(1, now + cfg.cues.returnMs / 1000);
      duckGain.gain.cancelScheduledValues(now);
      duckGain.gain.setValueAtTime(1, now);
      sched.reset(now);
      sched.burst(now + 0.05, cfg.geiger.overshootBurst.clicks, rate0() * cfg.geiger.overshootBurst.rateMul);
    },
    scare() {
      if (!ctx || mode === 'idle' || intensity === 'calm') return;
      const now = ctx.currentTime;
      const s = cfg.scare;
      const peak = dbToLin(reduced ? s.reducedPeakDbfs : s.peakDbfs) / 1.25;
      scareBus.gain.cancelScheduledValues(now);
      scareBus.gain.setValueAtTime(peak, now);
      const n = ctx.createBufferSource();
      n.buffer = scareNoise;
      n.connect(scareBus);
      n.start(now);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(s.sweepHz[0], now);
      o.frequency.exponentialRampToValueAtTime(s.sweepHz[1], now + s.sweepMs / 1000);
      const g = gain(0, scareBus);
      const sine = dbToLin(s.sweepDb);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(sine, now + s.attackMs / 1000);
      g.gain.setValueAtTime(sine, now + (s.attackMs + s.holdMs) / 1000);
      g.gain.exponentialRampToValueAtTime(sine * dbToLin(s.floorDb), now + s.sweepMs / 1000);
      g.gain.linearRampToValueAtTime(0, now + s.sweepMs / 1000 + 0.01);
      o.connect(g);
      o.start(now);
      o.stop(now + s.durationMs / 1000);
    },
    fault() {
      if (ctx) staticOffUntil = ctx.currentTime + cfg.cues.faultDropoutMs / 1000;
    },
    setReduced(on) {
      reduced = on;
    },
    dispose() {
      this.stop();
      if (ctx) void ctx.close();
      ctx = null;
      humOscs = [];
      humGains = [];
      variants = [];
      mode = 'idle';
      faded = false;
    },
  };
}
