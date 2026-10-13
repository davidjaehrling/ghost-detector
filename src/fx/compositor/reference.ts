/**
 * Reference levels for the clamp and the occlusion. The dark region from `findDarkRegion` is a
 * threshold component, so its mean sits below everything around it, and `placeGhost` (margins,
 * off-centroid offset) often puts part of the figure outside it. Measured on the fixtures, the
 * scene under the figure box was 18.7 luma on attic against a region mean of 3.1, and 94.7 on
 * outdoors against 49.5: a clamp at region mean + 24 left almost no room there (mean lift 4.5 to
 * 4.7). So when the luma grid is known, the reference is the scene under the figure's union box
 * (never below the region's own level): the ghost stays within 24 luma of what it stands on and
 * is hidden where that area is brighter than its own 80th percentile (its bright edges).
 */
import type { Placement, RegionInput } from '../ghostV0/placement';
import { OCC_GRID_BLUR, OCC_RAMP } from './blend';
import { estimateP80, lumaUnder, occlusionGrid, type LumaGrid } from './regionStats';

/**
 * Least share of the figure the scene must cut (D-017): on a dark scene the 80th percentile of
 * the area sits above everything under the figure, so occlusion never engaged outside attic. The
 * threshold is lowered until at least this share (with a margin, OCC_CUT_TARGET) of the cells
 * under the figure's ellipse are hidden.
 */
export const OCC_CUT_MIN = 0.1;
export const OCC_CUT_TARGET = 0.11;
/** Narrowest occlusion ramp, luma: on a flat dark scene the ramp shrinks to the scene's spread. */
export const OCC_RAMP_MIN = 3;

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Grid cells (0..255) inside the ellipse inscribed in a panel box, the figure's rough footprint. */
export function cellsUnderFigure(grid: LumaGrid, box: { x: number; y: number; w: number; h: number }, photoRect: ReferenceInput['photoRect']): number[] {
  const { luma, width, height } = grid;
  const out: number[] = [];
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rx = (box.w / 2) * 0.8;
  const ry = (box.h / 2) * 0.95;
  const gx0 = Math.max(0, Math.floor(((cx - rx - photoRect.x) / photoRect.width) * width));
  const gx1 = Math.min(width - 1, Math.ceil(((cx + rx - photoRect.x) / photoRect.width) * width));
  const gy0 = Math.max(0, Math.floor(((cy - ry - photoRect.y) / photoRect.height) * height));
  const gy1 = Math.min(height - 1, Math.ceil(((cy + ry - photoRect.y) / photoRect.height) * height));
  for (let gy = gy0; gy <= gy1; gy++)
    for (let gx = gx0; gx <= gx1; gx++) {
      const px = photoRect.x + ((gx + 0.5) / width) * photoRect.width;
      const py = photoRect.y + ((gy + 0.5) / height) * photoRect.height;
      if (((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1) out.push(luma[gy * width + gx]!);
    }
  return out;
}

/** Share of `cells` hidden by an occlusion threshold `occ` with a ramp of `ramp` luma. */
export function cutShare(cells: readonly number[], occ: number, ramp: number): number {
  if (!cells.length) return 0;
  let s = 0;
  for (const v of cells) s += smooth(occ, occ + ramp, v);
  return s / cells.length;
}

/**
 * Adaptive occlusion: keep `occ` if it already hides OCC_CUT_TARGET of the figure's cells, else
 * lower it (bisection) until it does. The ramp narrows with the scene's spread under the figure
 * (q95 - q50, at least OCC_RAMP_MIN), so a flat dark scene is cut in patches, not dimmed evenly.
 */
export function adaptOcclusion(cells: readonly number[], occ: number): { occ: number; ramp: number } {
  if (!cells.length) return { occ, ramp: OCC_RAMP };
  const s = cells.slice().sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
  const ramp = Math.min(OCC_RAMP, Math.max(OCC_RAMP_MIN, (q(0.95) - q(0.5)) / 2));
  if (cutShare(s, occ, ramp) >= OCC_CUT_TARGET) return { occ, ramp };
  let lo = q(0) - ramp;
  let hi = occ;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (cutShare(s, mid, ramp) >= OCC_CUT_TARGET) lo = mid;
    else hi = mid;
  }
  return { occ: lo, ramp };
}

export interface ReferenceInput {
  meanLuma: number;
  p80Luma?: number;
  p90Luma?: number;
  /** Null when the statistics describe the whole frame (no dark region). */
  region?: RegionInput | null;
  grid?: LumaGrid;
  placement: Placement;
  /** Where the photo sits in the panel, in panel pixels. */
  photoRect: { x: number; y: number; width: number; height: number };
}

export interface Reference {
  /** Clamp reference: no ghost pixel is lifted above this + `CLAMP_LIFT`. 0..255. */
  mean: number;
  /** Occlusion threshold: the ghost is hidden where the blurred scene is brighter. 0..255. */
  occ: number;
  /** Width of the occlusion ramp above `occ`, luma. */
  ramp: number;
  source: 'figure' | 'region';
}

/** Figure plus motion copies (and the CRITICAL echo), in panel pixels. */
export function unionBox(p: Placement): { x: number; y: number; w: number; h: number } {
  const xs = [0, ...p.offsetCopies.map((c) => c.dx), p.echo?.dx ?? 0];
  const ys = [0, ...p.offsetCopies.map((c) => c.dy), p.echo?.dy ?? 0];
  const x = p.x + Math.min(...xs);
  const y = p.y + Math.min(...ys);
  return { x, y, w: p.w + Math.max(...xs) - Math.min(...xs), h: p.h + Math.max(...ys) - Math.min(...ys) };
}

export function reference(i: ReferenceInput): Reference {
  const p80 = i.p80Luma ?? estimateP80(i.meanLuma, i.p90Luma);
  const regionOcc = i.region === null ? Math.max(p80, i.p90Luma ?? p80) : p80;
  if (i.grid && i.photoRect.width > 0 && i.photoRect.height > 0) {
    const u = unionBox(i.placement);
    const r = i.photoRect;
    const local = lumaUnder(i.grid, { x: (u.x - r.x) / r.width, y: (u.y - r.y) / r.height, w: u.w / r.width, h: u.h / r.height });
    if (local) {
      const a = adaptOcclusion(cellsUnderFigure(occlusionGrid(i.grid, OCC_GRID_BLUR), i.placement, r), Math.max(regionOcc, local.p80));
      return { mean: Math.max(i.meanLuma, local.mean), occ: a.occ, ramp: a.ramp, source: 'figure' };
    }
  }
  return { mean: i.meanLuma, occ: regionOcc, ramp: OCC_RAMP, source: 'region' };
}
