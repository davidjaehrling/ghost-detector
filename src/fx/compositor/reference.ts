/**
 * Reference levels for the clamp and the occlusion. The dark region from `findDarkRegion` is a
 * threshold component, so its mean sits below everything around it, and `placeGhost` (margins,
 * off-centroid offset) often puts part of the figure outside it. Measured on the fixtures, the
 * scene under the figure box was 18.7 luma on attic against a region mean of 3.1, and 94.7 on
 * outdoors against 49.5: round 1's clamp at region mean + 24 left almost no room there (mean lift
 * 4.5 to 4.7). So when the luma grid is known, the reference is the scene under the figure's union
 * box (never below the region's own level): the ghost stays within `CLAMP_LIFT` (34) luma of what
 * it stands on and is hidden where that area is brighter than its own 80th percentile (its bright
 * edges).
 */
import { mulberry32 } from '../../engine';
import type { Placement, RegionInput } from '../ghostV0/placement';
import { bandVisibility, OCC_GRID_BLUR, OCC_RAMP, type Band } from './blend';
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

/**
 * Flat scene (D-022): below this mean luma gradient (luma per grid cell, raw grid, over the cells
 * under the figure's ellipse) nothing in the scene can cross the figure, so the adaptive threshold
 * would only cut sensor noise. The compositor then synthesises a foreground band instead.
 */
export const FLAT_GRADIENT = 2.5;
/**
 * Band height as a share of the figure height (seeded), and where its bottom edge sits down the
 * figure box (seeded): at or past the end of the hem dissolve, so the figure goes behind it and
 * does not come out under it. Its centre then lies in the lower third.
 */
export const BAND_H: readonly [number, number] = [0.15, 0.3];
export const BAND_BOTTOM: readonly [number, number] = [0.94, 1.0];
/** Ragged edge amplitude as a share of the figure height, and the most the band may slant. */
export const BAND_RAG = 0.035;
export const BAND_SLOPE = 0.12;

/**
 * Mean absolute luma gradient (central differences, half the x plus half the y step) over the grid
 * cells under the ellipse inscribed in a panel box.
 */
export function gradientEnergy(grid: LumaGrid, box: { x: number; y: number; w: number; h: number }, photoRect: ReferenceInput['photoRect']): number {
  const { luma, width, height } = grid;
  const at = (x: number, y: number) => luma[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))]!;
  let sum = 0;
  let n = 0;
  forEllipseCells(grid, box, photoRect, (gx, gy) => {
    sum += (Math.abs(at(gx + 1, gy) - at(gx - 1, gy)) + Math.abs(at(gx, gy + 1) - at(gx, gy - 1))) / 4;
    n++;
  });
  return n ? sum / n : 0;
}

/** Share of the figure's ellipse (sampled every 2 px) the band hides, and what scene cut leaves. */
export function bandCut(band: Band, box: { x: number; y: number; w: number; h: number }): number {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rx = (box.w / 2) * 0.8;
  const ry = (box.h / 2) * 0.95;
  let s = 0;
  let n = 0;
  for (let y = cy - ry; y <= cy + ry; y += 2)
    for (let x = cx - rx; x <= cx + rx; x += 2) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
      s += 1 - bandVisibility(x, y, band);
      n++;
    }
  return n ? s / n : 0;
}

/**
 * The synthetic foreground band for a figure box: a seeded height (BAND_H of the figure) with its
 * bottom BAND_BOTTOM of the way down it (its centre in the lower third), a seeded slant and ragged
 * edges. Grown about its centre (up to BAND_H's top) and then moved up (to the top of the lower
 * third) until it hides OCC_CUT_TARGET of the figure's ellipse.
 */
export function makeBand(box: { x: number; y: number; w: number; h: number }, seed: number): Band {
  const rnd = mulberry32((seed ^ 0x2545f491) >>> 0);
  let hb = BAND_H[0] + (BAND_H[1] - BAND_H[0]) * rnd();
  let c = BAND_BOTTOM[0] + (BAND_BOTTOM[1] - BAND_BOTTOM[0]) * rnd() - hb / 2;
  const slope = (rnd() * 2 - 1) * BAND_SLOPE;
  const ph = [0, 0, 0, 0, 0, 0].map(() => rnd() * Math.PI * 2) as unknown as Band['ph'];
  const at = (): Band => ({ y0: box.y + box.h * (c - hb / 2), y1: box.y + box.h * (c + hb / 2), cx: box.x + box.w / 2, slope, rag: BAND_RAG * box.h, ph });
  for (let i = 0; i < 40 && bandCut(at(), box) < OCC_CUT_TARGET; i++) {
    if (hb < BAND_H[1]) hb = Math.min(BAND_H[1], hb + 0.01);
    else c = Math.max(2 / 3, c - 0.01);
  }
  return at();
}

function forEllipseCells(grid: LumaGrid, box: { x: number; y: number; w: number; h: number }, photoRect: ReferenceInput['photoRect'], f: (gx: number, gy: number) => void): void {
  const { width, height } = grid;
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
      if (((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1) f(gx, gy);
    }
}

/** Grid cells (0..255) inside the ellipse inscribed in a panel box, the figure's rough footprint. */
export function cellsUnderFigure(grid: LumaGrid, box: { x: number; y: number; w: number; h: number }, photoRect: ReferenceInput['photoRect']): number[] {
  const out: number[] = [];
  forEllipseCells(grid, box, photoRect, (gx, gy) => out.push(grid.luma[gy * grid.width + gx]!));
  return out;
}

/** Share of `cells` hidden by an occlusion threshold `occ` with a ramp of `ramp` luma. */
export function cutShare(cells: readonly number[], occ: number, ramp: number): number {
  if (!cells.length) return 0;
  let s = 0;
  for (const v of cells) s += smooth(occ, occ + ramp, v);
  return s / cells.length;
}

/** Half the q95 - q50 spread of the cells, luma. */
function rampOf(cells: readonly number[]): number {
  const s = cells.slice().sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
  return (q(0.95) - q(0.5)) / 2;
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
  const ramp = Math.min(OCC_RAMP, Math.max(OCC_RAMP_MIN, rampOf(s)));
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
  /** Seeds the synthetic band on a flat scene. */
  seed?: number;
}

export interface Reference {
  /** Clamp reference: no ghost pixel is lifted above this + `CLAMP_LIFT`. 0..255. */
  mean: number;
  /** Occlusion threshold: the ghost is hidden where the blurred scene is brighter. 0..255. */
  occ: number;
  /** Width of the occlusion ramp above `occ`, luma. */
  ramp: number;
  source: 'figure' | 'region';
  /** Mean luma gradient under the figure (`gradientEnergy`), when the grid is known. */
  gradient?: number;
  /** Synthetic foreground band on a flat scene (gradient under FLAT_GRADIENT), else null. */
  band: Band | null;
  /** Share of the figure's ellipse hidden by the scene threshold and the band together. */
  cut?: number;
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
      const cells = cellsUnderFigure(occlusionGrid(i.grid, OCC_GRID_BLUR), i.placement, r);
      const occ0 = Math.max(regionOcc, local.p80);
      const gradient = gradientEnergy(i.grid, i.placement, r);
      const mean = Math.max(i.meanLuma, local.mean);
      if (gradient < FLAT_GRADIENT) {
        // Flat: keep the scene's own threshold (no lowering into the noise) and add the band.
        const ramp = Math.min(OCC_RAMP, Math.max(OCC_RAMP_MIN, rampOf(cells)));
        const band = makeBand(i.placement, i.seed ?? 0);
        const sceneCut = cutShare(cells, occ0, ramp);
        const cut = 1 - (1 - sceneCut) * (1 - bandCut(band, i.placement));
        return { mean, occ: occ0, ramp, source: 'figure', gradient, band, cut };
      }
      const a = adaptOcclusion(cells, occ0);
      return { mean, occ: a.occ, ramp: a.ramp, source: 'figure', gradient, band: null, cut: cutShare(cells, a.occ, a.ramp) };
    }
  }
  return { mean: i.meanLuma, occ: regionOcc, ramp: OCC_RAMP, source: 'region', band: null };
}
