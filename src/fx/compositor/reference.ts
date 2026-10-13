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
import { estimateP80, lumaUnder, type LumaGrid } from './regionStats';

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
  source: 'figure' | 'region';
}

/** Figure plus motion copies, in panel pixels. */
export function unionBox(p: Placement): { x: number; y: number; w: number; h: number } {
  const xs = [0, ...p.offsetCopies.map((c) => c.dx)];
  const ys = [0, ...p.offsetCopies.map((c) => c.dy)];
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
    if (local) return { mean: Math.max(i.meanLuma, local.mean), occ: Math.max(regionOcc, local.p80), source: 'figure' };
  }
  return { mean: i.meanLuma, occ: regionOcc, source: 'region' };
}
