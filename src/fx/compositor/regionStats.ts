/**
 * Shared, platform-free half of the compositor's `regionFromImage`: RGBA in, region and luma
 * statistics out. Same steps as v0 (`downsampleLuma` to 96 px, `findDarkRegion`) plus the region's
 * 80th percentile, which the compositor's scene-edge occlusion uses.
 */
import { downsampleLuma, findDarkRegion } from '../../engine';
import { REGION_GRID, type RegionResult } from '../ghostV0/regionFromPixels';

export { REGION_GRID };

/** The 96 px luma grid of the whole photo (row-major, 0..255). */
export interface LumaGrid {
  luma: Uint8Array;
  width: number;
  height: number;
}

export interface RegionStats extends RegionResult {
  /** 80th-percentile luma 0..255 inside the region's box (whole frame when `region` is null). */
  p80Luma: number;
  /** The grid the statistics came from, so the compositor can read the luma under the figure. */
  grid: LumaGrid;
}

function percentile(sorted: Uint8Array, p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

/** Region plus mean, p80 and p90 luma from a luma grid (long side `REGION_GRID`). */
export function statsFromLuma(luma: Uint8Array, width: number, height: number): RegionStats {
  const region = findDarkRegion(luma, width, height);
  let x0 = 0;
  let y0 = 0;
  let x1 = width;
  let y1 = height;
  if (region) {
    x0 = Math.floor(region.x * width);
    y0 = Math.floor(region.y * height);
    x1 = Math.min(width, Math.max(x0 + 1, Math.round((region.x + region.w) * width)));
    y1 = Math.min(height, Math.max(y0 + 1, Math.round((region.y + region.h) * height)));
  }
  const box = new Uint8Array((x1 - x0) * (y1 - y0));
  let k = 0;
  let sum = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const v = luma[y * width + x]!;
      box[k++] = v;
      sum += v;
    }
  box.sort();
  const meanLuma = region ? region.meanLuma : sum / Math.max(1, box.length);
  return { region, meanLuma, p80Luma: percentile(box, 0.8), p90Luma: percentile(box, 0.9), grid: { luma, width, height } };
}

/**
 * Mean and 80th-percentile luma of the grid cells under a box given in normalised photo
 * coordinates (0..1), clipped to the photo. Null when the box misses the photo.
 */
export function lumaUnder(grid: LumaGrid, box: { x: number; y: number; w: number; h: number }): { mean: number; p80: number } | null {
  const { luma, width, height } = grid;
  const x0 = Math.max(0, Math.floor(box.x * width));
  const y0 = Math.max(0, Math.floor(box.y * height));
  const x1 = Math.min(width, Math.ceil((box.x + box.w) * width));
  const y1 = Math.min(height, Math.ceil((box.y + box.h) * height));
  if (x1 <= x0 || y1 <= y0) return null;
  const cells = new Uint8Array((x1 - x0) * (y1 - y0));
  let k = 0;
  let sum = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const v = luma[y * width + x]!;
      cells[k++] = v;
      sum += v;
    }
  cells.sort();
  return { mean: sum / cells.length, p80: percentile(cells, 0.8) };
}

/** RGBA (any size) to region statistics. */
export function statsFromRgba(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number): RegionStats {
  const data = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length);
  const { luma, width, height } = downsampleLuma(data, w, h, REGION_GRID);
  return statsFromLuma(luma, width, height);
}

/**
 * Sizes for downscaling a large photo on the GPU by repeated halving (each step a bilinear 2:1,
 * close to a box filter) until the long side is at most `2 * target`; `downsampleLuma` then
 * box-filters the last step to `target`. The first entry is the first reduced size.
 */
export function halvingSteps(w: number, h: number, target = REGION_GRID): { w: number; h: number }[] {
  const out: { w: number; h: number }[] = [];
  let cw = Math.max(1, Math.round(w));
  let ch = Math.max(1, Math.round(h));
  while (Math.max(cw, ch) > 2 * target) {
    cw = Math.max(1, Math.round(cw / 2));
    ch = Math.max(1, Math.round(ch / 2));
    out.push({ w: cw, h: ch });
  }
  return out;
}

/** p80 when only the mean and p90 are known (the jpeg-js fallback): 70% of the way to p90. */
export function estimateP80(meanLuma: number, p90Luma?: number): number {
  const p90 = p90Luma ?? meanLuma + 30;
  return meanLuma + 0.7 * Math.max(0, p90 - meanLuma);
}
