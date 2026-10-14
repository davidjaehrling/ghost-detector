/** Pure helpers for the ghost layer: motion copies and blur. No Skia, so they run under Vitest. */
import { fbm, RAG_CORE, RAG_CYCLES, RAG_DISPLACE, RAG_EDGES, RAG_ERODE, RAG_STRETCH, ragOffset } from '../apparition/metrics';
import { APPARITION_ASPECT } from '../apparition/shape';
import type { Tier } from '../../engine';
import type { OffsetCopy, Placement } from '../ghostV0/placement';

/** Ghost blur sigma as a fraction of the figure width (the scene gets none). */
export const GHOST_BLUR = 0.025;
/** TRACE and QUIET show a smudge: this much more blur, so no head shape survives. */
export const SMUDGE_BLUR = 2.4;
export const MIN_COPIES = 3;
export const MAX_COPIES = 5;

/**
 * 3 to 5 directional copies. `placeGhost` gives 3 to 5 (2 to 4 on CRITICAL); when it gives fewer
 * than 3, the gap to the first copy is split so the smear has 3 steps without reaching further.
 * The alpha budget is kept: the split copies share the alpha of the copies they came from.
 */
export function motionCopies(copies: readonly OffsetCopy[]): OffsetCopy[] {
  let out = copies.slice(0, MAX_COPIES).map((c) => ({ ...c }));
  while (out.length > 0 && out.length < MIN_COPIES) {
    const first = out[0]!;
    out = [{ dx: first.dx / 2, dy: first.dy / 2, alpha: first.alpha / 2 }, { ...first, alpha: first.alpha / 2 }, ...out.slice(1)];
  }
  return out;
}

/** Blur sigma in layout pixels for a figure width and tier. */
export function ghostBlurSigma(figureW: number, tier?: Tier): number {
  const smudge = tier === 'trace' || tier === 'quiet';
  return Math.max(1.2, figureW * GHOST_BLUR) * (smudge ? SMUDGE_BLUR : 1);
}

/** One-sided vertical motion smear (D-017): length in layout px and samples along it. */
export const SMEAR_PX: readonly [number, number] = [6, 10];
export const SMEAR_STEPS = 6;

/**
 * Smear for a seed: `length` px (6 to 10) and `dir` (+1 down, -1 up). The figure is drawn at
 * SMEAR_STEPS offsets from 0 to `dir * length`, added (Plus) with these weights, which fall off
 * exponentially and sum to 1: a true one-sided motion blur that never adds alpha.
 */
export function smearFor(seed: number): { length: number; dir: 1 | -1; offsets: number[]; weights: number[] } {
  let h = Math.imul((seed >>> 0) ^ 0x5bd1e995, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  const u = ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  const length = SMEAR_PX[0] + (SMEAR_PX[1] - SMEAR_PX[0]) * u;
  // Most trails run down (the figure drifting up); one in four runs up.
  const dir: 1 | -1 = ((h >>> 7) & 3) === 0 ? -1 : 1;
  const raw = Array.from({ length: SMEAR_STEPS }, (_, k) => Math.exp((-2 * k) / (SMEAR_STEPS - 1)));
  const sum = raw.reduce((a, b) => a + b, 0);
  return {
    length,
    dir,
    offsets: raw.map((_, k) => (dir * length * k) / (SMEAR_STEPS - 1)),
    weights: raw.map((w) => w / sum),
  };
}

/**
 * Every copy the ghost layer draws, in draw order, with its alpha as a multiple of
 * `Placement.opacity`: the CRITICAL echo first (under everything), then the motion copies
 * farthest first, then the main figure (alpha 1) on top.
 */
export function layerCopies(p: Pick<Placement, 'offsetCopies' | 'echo'>): OffsetCopy[] {
  return (p.echo ? [p.echo] : []).concat(motionCopies(p.offsetCopies).reverse(), { dx: 0, dy: 0, alpha: 1 });
}

/** Directional smear added on the jump-scare pop frame (D-023): length in layout px and samples. */
export const POP_SMEAR_PX: readonly [number, number] = [6, 10];
export const POP_SMEAR_STEPS = 5;

/**
 * The pop frame's directional smear: `length` px (6 to 10, seeded) along the figure's motion, the
 * unit vector from the figure toward its motion copies (its trail; sideways when it has none). As
 * with `smearFor`, the samples fall off exponentially and their weights sum to 1, so the smear
 * spreads the figure's alpha along its path without adding any: it reads as movement.
 */
export function popSmearFor(seed: number, p: Pick<Placement, 'offsetCopies' | 'flipX'>): { length: number; ux: number; uy: number; offsets: [number, number][]; weights: number[] } {
  let h = Math.imul((seed >>> 0) ^ 0x3c6ef372, 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  const u = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  const length = POP_SMEAR_PX[0] + (POP_SMEAR_PX[1] - POP_SMEAR_PX[0]) * u;
  let sx = 0;
  let sy = 0;
  for (const c of p.offsetCopies) {
    sx += c.dx;
    sy += c.dy;
  }
  const n = Math.hypot(sx, sy);
  const [ux, uy] = n > 1e-6 ? [sx / n, sy / n] : [p.flipX ? 1 : -1, 0];
  const raw = Array.from({ length: POP_SMEAR_STEPS }, (_, k) => Math.exp((-1.5 * k) / (POP_SMEAR_STEPS - 1)));
  const sum = raw.reduce((a, b) => a + b, 0);
  return {
    length,
    ux,
    uy,
    offsets: raw.map((_, k) => [(ux * length * k) / (POP_SMEAR_STEPS - 1), (uy * length * k) / (POP_SMEAR_STEPS - 1)] as [number, number]),
    weights: raw.map((w) => w / sum),
  };
}

/**
 * TS model of the pop frame's figure for tests: an apparition alpha grid (`alphaGrid`, `gw` x
 * `gh` cells over an image `imagePx` wide) drawn at every tap of the vertical smear times the
 * pop's directional smear, as `buildGhostLayer` does with `pop`, then through the pop's dissolve
 * (the variants' ragged-edge pass again, POP_RAG_SKSL's twin, value noise standing in for
 * FractalNoise as in `metrics.ts`), then lifted on the pop's linear clamp curve so its peak is
 * `peakAlpha` (POP_ALPHA). Returns the effective alpha per cell.
 */
export function popFrameGrid(
  g: { w: number; h: number; alpha: Float32Array },
  o: { seed: number; imagePx: number; peakAlpha: number; placement: Pick<Placement, 'offsetCopies' | 'flipX'> },
): { w: number; h: number; alpha: Float32Array } {
  const cell = o.imagePx / g.w;
  const v = smearFor(o.seed);
  const d = popSmearFor(o.seed, o.placement);
  const at = (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const c = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= g.w || yy >= g.h ? 0 : g.alpha[yy * g.w + xx]!);
    return (c(x0, y0) * (1 - fx) + c(x0 + 1, y0) * fx) * (1 - fy) + (c(x0, y0 + 1) * (1 - fx) + c(x0 + 1, y0 + 1) * fx) * fy;
  };
  const out = new Float32Array(g.w * g.h);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      let s = 0;
      for (let k = 0; k < v.offsets.length; k++)
        for (let j = 0; j < d.offsets.length; j++)
          s += v.weights[k]! * d.weights[j]! * at(x - d.offsets[j]![0] / cell, y - (v.offsets[k]! + d.offsets[j]![1]) / cell);
      out[y * g.w + x] = s;
    }
  // The dissolve: displacement and edge bite, on alpha relative to the layer's peak (1 here).
  const ss = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const rSeed = (o.seed % 9973) * 23 + 5;
  const rag = new Float32Array(g.w * g.h);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const u = (x + 0.5) / g.w;
      const vv = (y + 0.5) / g.h;
      const hu = u * RAG_CYCLES;
      const hv = vv * RAG_CYCLES * 2;
      const du = ragOffset(fbm(hu, hv, rSeed)) * RAG_DISPLACE * 0.5;
      const dv = ragOffset(fbm(hu + 13.1, hv + 7.7, rSeed)) * RAG_DISPLACE * 0.5 * APPARITION_ASPECT;
      const a = sampleOut(out, g.w, g.h, u + du, vv + dv);
      const bite = ss(RAG_EDGES[0], RAG_EDGES[1], fbm(u * RAG_CYCLES + 29.3, vv * RAG_CYCLES * 2 * RAG_STRETCH + 3.9, rSeed + 1)) * (1 - ss(RAG_CORE[0], RAG_CORE[1], a));
      const t = Math.min(0.95, RAG_ERODE * bite);
      rag[y * g.w + x] = Math.min(1, Math.max(0, (a - t) / (1 - t)));
    }
  // The pop's gain puts the layer's peak at peakAlpha; its clamp curve is linear (POP_GAMMA 1).
  let peak = 0;
  for (const a of g.alpha) peak = Math.max(peak, a);
  for (let i = 0; i < rag.length; i++) rag[i] = (o.peakAlpha * rag[i]!) / Math.max(1e-6, peak);
  return { w: g.w, h: g.h, alpha: rag };
}

/** Bilinear sample of a grid at a normalised point (zero outside). */
function sampleOut(a: Float32Array, w: number, h: number, u: number, v: number): number {
  const x = u * w - 0.5;
  const y = v * h - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const c = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : a[yy * w + xx]!);
  return (c(x0, y0) * (1 - fx) + c(x0 + 1, y0) * fx) * (1 - fy) + (c(x0, y0 + 1) * (1 - fx) + c(x0 + 1, y0 + 1) * fx) * fy;
}
