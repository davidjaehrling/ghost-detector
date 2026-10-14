/**
 * Pure timing logic for the audio engine: Poisson click times, rate ramps,
 * phase cues, levels. No audio API here, so it runs in Vitest.
 */
import { mulberry32 } from '../engine/rng';
import { dbToLin, tierFrac, type Intensity, type SoundConfig, type Tier } from './config';

/** Scan theatre phase (src/ui/scan/timeline.ts). */
export type ScanPhase = 0 | 1 | 2 | 3 | 4;

export interface ClickEvent {
  /** Seconds on the audio clock. */
  t: number;
  /** Index into the pre-rendered variants. */
  variant: number;
  gainDb: number;
  playbackRate: number;
}

/**
 * Inter-click time. Exponential with a dead time: dt = refractory + Exp(1/(1/rate - refractory)),
 * so no two clicks are closer than the refractory floor and the mean rate stays `rate`.
 */
export function clickDt(u: number, rate: number, refractoryMs: number): number {
  const r = refractoryMs / 1000;
  const mean = Math.max(1 / Math.max(rate, 1e-6) - r, 1e-4);
  return r - Math.log(1 - u) * mean; // 1 - u in (0, 1]
}

/** Click burst lengths: the weighted pick lands on 1.5 ms most of the time. */
export function variantDurationsMs(clickMs: readonly [number, number]): number[] {
  const [lo, hi] = clickMs;
  const mid = Math.min(hi, Math.max(lo, 1.5));
  return [lo, mid, mid, hi];
}

/** Smooth zero-mean wobble in [-1, 1] at about `hz`, a pure function of time and seed. */
export function wobble(tSec: number, seed: number, hz = 0.4): number {
  const x = tSec * hz;
  const i = Math.floor(x);
  const f = x - i;
  const lat = (k: number) => mulberry32((seed ^ Math.imul(k + 101, 0x9e3779b1)) >>> 0)() * 2 - 1;
  const s = (1 - Math.cos(Math.PI * f)) / 2;
  return lat(i) * (1 - s) + lat(i + 1) * s;
}

/** Fraction of the way from the QUIET rate to the tier rate at the start of each phase. */
export const PHASE_RATE_FRAC: readonly number[] = [0.1, 0.35, 0.7, 1, 1];
/** Length of one rate glide, seconds (about one phase of a 8 s scan). */
export const GLIDE_S = 1.2;

export function baseRate(cfg: SoundConfig, tier: Tier, intensity: Intensity): number {
  return cfg.geiger.ratePerSec[tier][intensity];
}

/** Rate during a scan: QUIET value easing up to the tier value (ease-in). */
export function scanRate(cfg: SoundConfig, tier: Tier, intensity: Intensity, frac: number): number {
  const q = baseRate(cfg, 'quiet', intensity);
  const e = frac * frac * (3 - 2 * frac);
  return q + (baseRate(cfg, tier, intensity) - q) * Math.min(1, Math.max(0, e));
}

export interface Glide {
  from: number;
  to: number;
  startT: number;
  durS: number;
}
export function glideAt(g: Glide, t: number): number {
  const k = g.durS <= 0 ? 1 : Math.min(1, Math.max(0, (t - g.startT) / g.durS));
  return g.from + (g.to - g.from) * k;
}

/** Viewfinder link: rate follows the reading's distance from the running baseline. */
export function fluxRate(cfg: SoundConfig, base: number, fluxMg: number, baselineMg: number, cap: number): number {
  const r = base * (1 + (cfg.geiger.fluxK * Math.max(0, Math.abs(fluxMg - baselineMg))) / cfg.geiger.fluxSpanMg);
  return Math.min(r, cap);
}

/** Number of graticule lines crossed moving from `prev` to `next`. */
export function graticuleCrossings(prev: number, next: number, stepMg: number): number {
  return Math.abs(Math.floor(next / stepMg) - Math.floor(prev / stepMg));
}

export interface ClickScheduler {
  /** Click events with t in [from, until). `rateAt(t)` is the mean rate in clicks per second. */
  advance(until: number, rateAt: (t: number) => number): ClickEvent[];
  /** Queue `n` extra clicks starting at `t`, spaced at `rate` per second. */
  burst(t: number, n: number, rate: number): void;
  reset(t: number): void;
}

export function createClickScheduler(cfg: SoundConfig, seed: number, startT = 0): ClickScheduler {
  const rng = mulberry32(seed);
  const g = cfg.geiger;
  let next = startT;
  let drawn = false;
  let pending: number[] = [];
  const mk = (t: number): ClickEvent => ({
    t,
    variant: Math.floor(rng() * 4),
    gainDb: (rng() * 2 - 1) * g.scatterDb,
    playbackRate: 1 + (rng() * 2 - 1) * g.rateScatter,
  });
  return {
    advance(until, rateAt) {
      const out: ClickEvent[] = [];
      for (let guard = 0; guard < 10000; guard++) {
        if (!drawn) {
          const rate = rateAt(next);
          if (rate <= 0) {
            next = Math.max(next, until);
            return mergeBurst(out, pending, until, mk);
          }
          next += clickDt(rng(), rate, g.refractoryMs);
          drawn = true;
        }
        if (next >= until) break;
        out.push(mk(next));
        drawn = false;
      }
      return mergeBurst(out, pending, until, mk);
    },
    burst(t, n, rate) {
      const step = Math.max(1 / rate, g.refractoryMs / 1000);
      for (let i = 0; i < n; i++) pending.push(t + i * step);
    },
    reset(t) {
      next = t;
      drawn = false;
      pending = [];
    },
  };
  function mergeBurst(out: ClickEvent[], q: number[], until: number, make: (t: number) => ClickEvent): ClickEvent[] {
    const due = q.filter((t) => t < until);
    pending = q.filter((t) => t >= until);
    for (const t of due) out.push(make(t));
    out.sort((a, b) => a.t - b.t);
    // Enforce the refractory floor after merging a burst into the Poisson stream.
    const floor = g.refractoryMs / 1000;
    const kept: ClickEvent[] = [];
    for (const c of out) if (kept.length === 0 || c.t - kept[kept.length - 1]!.t >= floor) kept.push(c);
    return kept;
  }
}

/** All clicks of a steady `rate` over `seconds`, for tests and tuning. */
export function simulateClicks(cfg: SoundConfig, seed: number, rate: number, seconds: number): ClickEvent[] {
  return createClickScheduler(cfg, seed).advance(seconds, () => rate);
}

/** Does the signal-breaking-through effect play when entering `phase`? STRONG and CRITICAL only. */
export function breakthroughAtPhase(tier: Tier, intensity: Intensity, phase: ScanPhase): boolean {
  if (tier !== 'strong' && tier !== 'critical') return false;
  return phase === 3 || (intensity === 'brave' && phase === 4);
}

/** Static level on the breakthrough: CRITICAL runs 4 dB over STRONG (the tier table already gives +6). */
export function staticLevelDb(cfg: SoundConfig, tier: Tier, frac = 1): number {
  const q = cfg.static.levelDbfs.quiet;
  return q + (cfg.static.levelDbfs[tier] - q) * frac;
}

export function humLevelDb(cfg: SoundConfig, tier: Tier, frac = 1): number {
  const [lo, hi] = cfg.hum.levelDbfs;
  const tf = tierFrac(tier) * frac;
  return lo + (hi - lo) * tf;
}
export function humLowpassHz(cfg: SoundConfig, tier: Tier, frac = 1): number {
  const [lo, hi] = cfg.hum.lowpassHz;
  return lo + (hi - lo) * tierFrac(tier) * frac;
}

export function geigerLevelDb(cfg: SoundConfig, rate: number, cap: number): number {
  const [lo, hi] = cfg.geiger.levelDbfs;
  return lo + (hi - lo) * Math.min(1, rate / Math.max(cap, 1));
}

/**
 * Scare start window in ms from scan start (palette section 6), or null when the scan is
 * too short to fit the burst and its 150 ms of silence before the hold (CRITICAL scans
 * run 7 s or more, so this does not happen for a real scare).
 */
export function scareWindow(cfg: SoundConfig, scanMs: number): { startMs: number; endMs: number } | null {
  const s = cfg.scare;
  const startMs = s.windowStart * scanMs;
  const latest = scanMs - cfg.holdMs - 150 - s.durationMs;
  if (latest < startMs) return null;
  return { startMs, endMs: Math.min(s.windowEnd * scanMs, latest) };
}

export const peakLin = (cfg: SoundConfig) => dbToLin(cfg.masterCeilingDbfs);

/** Ordered cue list for a scan, for the engine's own tests and the L2 log (times in ms). */
export interface Cue {
  tMs: number;
  cue: 'relay' | 'keyTick' | 'breakthrough' | 'hold' | 'reveal';
}
export function scanCues(cfg: SoundConfig, scanMs: number, tier: Tier, intensity: Intensity, fault = false): Cue[] {
  const active = scanMs - cfg.holdMs;
  const cues: Cue[] = [{ tMs: 0, cue: 'relay' }];
  for (const p of [0.25, 0.5]) cues.push({ tMs: p * active, cue: 'keyTick' });
  for (const ph of [3, 4] as const) if (breakthroughAtPhase(tier, intensity, ph)) cues.push({ tMs: (ph / 5) * active, cue: 'breakthrough' });
  const shift = fault ? 1500 : 0;
  cues.push({ tMs: active + shift, cue: 'hold' }, { tMs: scanMs + shift, cue: 'reveal' });
  return cues.sort((a, b) => a.tMs - b.tMs);
}
