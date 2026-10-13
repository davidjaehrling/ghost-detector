import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../config';
import { createAudioEngine, type EngineDeps } from '../engine';
import { __audioLog, __clearAudioLog, createAudioEngine as createWeb } from '../engine.web';

// A recording stand-in for the Web Audio context: enough to run the whole graph.
function fakeAudio() {
  const started: { kind: string; t: number; gain?: number }[] = [];
  let now = 0;
  const param = (v = 0) => {
    const p: Record<string, unknown> = { value: v };
    for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues']) p[m] = () => p;
    return p;
  };
  const node = (kind: string) => {
    const n: Record<string, unknown> = {
      kind,
      connect: (x: unknown) => x,
      start: (t = now) => void started.push({ kind, t, gain: (n._gain as number) ?? undefined }),
      stop: () => undefined,
      gain: param(1),
      frequency: param(),
      Q: param(),
      playbackRate: param(1),
      buffer: null,
      loop: false,
    };
    return n;
  };
  class Ctx {
    sampleRate = 48000;
    destination = node('dest');
    get currentTime() {
      return now;
    }
    createGain = () => node('gain');
    createBiquadFilter = () => node('biquad');
    createOscillator = () => node('osc');
    createWaveShaper = () => node('shaper');
    createBufferSource = () => node('src');
    createBuffer = (_c: number, len: number) => ({ length: len, copyToChannel: () => undefined });
    resume = () => Promise.resolve();
    suspend = () => Promise.resolve();
    close = () => Promise.resolve();
  }
  const deps: EngineDeps = { loadAudio: () => ({ AudioContext: Ctx as never }) };
  return { deps, started, advance: (s: number) => void (now += s) };
}

afterEach(() => vi.useRealTimers());

describe('native engine (fake context)', () => {
  it('schedules about rate x seconds of clicks in a viewfinder at CRITICAL standard, none in the hold', () => {
    vi.useFakeTimers();
    const f = fakeAudio();
    const e = createAudioEngine(DEFAULT_CONFIG, {}, { ...f.deps, setInterval: (fn, ms) => setInterval(fn, ms), seed: 4 });
    e.setTier('critical');
    e.setIntensity('standard');
    e.start();
    const clicks = () => f.started.filter((s) => s.kind === 'src' && s.t >= 0).length;
    const base = clicks();
    for (let i = 0; i < 400; i++) {
      f.advance(0.025);
      vi.advanceTimersByTime(25);
    }
    const n = clicks() - base;
    expect(n).toBeGreaterThan(14 * 10 * 0.6);
    expect(n).toBeLessThan(14 * 10 * 1.4);
    e.hold();
    const before = clicks();
    for (let i = 0; i < 80; i++) {
      f.advance(0.025);
      vi.advanceTimersByTime(25);
    }
    expect(clicks()).toBe(before);
    e.reveal();
    e.scare();
    e.dispose();
  });
  it('scare is a no-op on calm', () => {
    const f = fakeAudio();
    const e = createAudioEngine(DEFAULT_CONFIG, {}, { ...f.deps, setInterval: () => 0, clearInterval: () => undefined });
    e.setIntensity('calm');
    e.start();
    const n = f.started.length;
    e.scare();
    expect(f.started.length).toBe(n);
  });
});

describe('web engine', () => {
  it('records every call in order with timestamps and creates no context', () => {
    __clearAudioLog();
    const e = createWeb();
    e.start();
    e.setTier('strong');
    e.scanPhase(0);
    e.hold();
    e.reveal();
    e.scare();
    expect(__audioLog().map((l) => l.call)).toEqual(['start', 'setTier', 'scanPhase', 'hold', 'reveal', 'scare']);
    expect(__audioLog()[1]!.args).toEqual(['strong']);
    const ts = __audioLog().map((l) => l.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
  });
});
