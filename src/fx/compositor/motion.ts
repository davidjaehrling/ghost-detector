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
