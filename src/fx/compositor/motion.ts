/** Pure helpers for the ghost layer: motion copies and blur. No Skia, so they run under Vitest. */
import type { Tier } from '../../engine';
import type { OffsetCopy } from '../ghostV0/placement';

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
