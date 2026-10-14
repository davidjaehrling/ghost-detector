/** Pure sample renderers. Everything the engine plays is built here from a seeded PRNG. */
import { mulberry32 } from '../engine/rng';
import { dbToLin, type SoundConfig } from './config';

type Rand = () => number;
const gauss = (r: Rand) => r() + r() + r() - 1.5;

/** One-pole band limit: high-pass at `lo`, low-pass at `hi`. */
function bandLimit(x: Float32Array, sr: number, lo: number, hi: number): void {
  const aL = Math.exp((-2 * Math.PI * hi) / sr);
  const aH = Math.exp((-2 * Math.PI * lo) / sr);
  let lp = 0;
  let hp = 0;
  let prev = 0;
  for (let i = 0; i < x.length; i++) {
    lp = (1 - aL) * x[i]! + aL * lp;
    hp = aH * (hp + lp - prev);
    prev = lp;
    x[i] = hp;
  }
}

function normalise(x: Float32Array, peak = 1): void {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] = (x[i]! / m) * peak;
}

/** Geiger click: band-limited noise, 0.2 ms attack, exponential decay to -60 dB over `ms`. Unit peak. */
export function renderClick(cfg: SoundConfig, ms: number, seed: number): Float32Array {
  const sr = cfg.sampleRate;
  const n = Math.max(8, Math.round((ms / 1000) * sr));
  const r = mulberry32(seed);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = gauss(r);
  bandLimit(x, sr, cfg.geiger.bandHz[0], cfg.geiger.bandHz[1]);
  const att = Math.max(1, Math.round(0.0002 * sr));
  for (let i = 0; i < n; i++) {
    const a = i < att ? i / att : 1;
    x[i] = x[i]! * a * Math.pow(10, (-60 * (i / n)) / 20);
  }
  normalise(x);
  return x;
}

/** Looping noise: white, or pink by the Kellet filter. Unit peak (roughly), `seconds` long. */
export function renderNoise(sr: number, seconds: number, pink: boolean, seed: number): Float32Array {
  const r = mulberry32(seed);
  const n = Math.round(sr * seconds);
  const x = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    if (!pink) x[i] = w;
    else {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  // Blend the loop seam so it does not click.
  const f = Math.round(sr * 0.01);
  for (let i = 0; i < f; i++) {
    const k = i / f;
    x[i] = x[i]! * k + x[n - f + i]! * (1 - k) * (1 - k);
  }
  normalise(x);
  return x;
}

/** Scare noise: high-passed, bit-crushed, shaped by the palette envelope. Unit peak. */
export function renderScareNoise(cfg: SoundConfig, seed: number): Float32Array {
  const s = cfg.scare;
  const sr = cfg.sampleRate;
  const n = Math.round((s.durationMs / 1000) * sr);
  const r = mulberry32(seed);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = r() * 2 - 1;
  bandLimit(x, sr, s.highpassHz, 8000);
  normalise(x);
  const levels = Math.pow(2, s.bits - 1);
  for (let i = 0; i < n; i++) x[i] = Math.round(x[i]! * levels) / levels;
  for (let i = 0; i < n; i++) x[i] = x[i]! * scareEnvelope(cfg, i / sr);
  return x;
}

/** Linear attack, hold, exponential decay to `floorDb` at the end. Gain 0..1. */
export function scareEnvelope(cfg: SoundConfig, tSec: number): number {
  const s = cfg.scare;
  const t = tSec * 1000;
  if (t < 0 || t > s.durationMs) return 0;
  if (t < s.attackMs) return t / s.attackMs;
  const holdEnd = s.attackMs + s.holdMs;
  if (t <= holdEnd) return 1;
  return dbToLin((s.floorDb * (t - holdEnd)) / Math.max(1, s.durationMs - holdEnd));
}

/** 12 ms thump: a sine with a fast decay. Unit peak. */
export function renderThump(cfg: SoundConfig): Float32Array {
  const sr = cfg.sampleRate;
  const n = Math.round((cfg.cues.thumpMs / 1000) * sr);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * cfg.cues.thumpHz * i) / sr) * Math.pow(1 - i / n, 2);
  normalise(x);
  return x;
}

/** Soft-knee ceiling curve for a WaveShaper: linear below the knee, saturating at `ceilingLin`. */
export function limiterCurve(ceilingLin: number, size = 2049): Float32Array {
  const knee = ceilingLin * 0.84;
  const room = ceilingLin - knee;
  const c = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = Math.sign(x) * (a <= knee ? a : knee + room * Math.tanh((a - knee) / room));
  }
  return c;
}

export function peakOf(x: Float32Array): number {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return m;
}
