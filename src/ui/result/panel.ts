import type { Tier } from '../../engine';
import { DEFAULT_OPACITY_RANGE, OPACITY_MAX, OPACITY_MIN, type RegionInput } from '../../fx/ghostV0/placement';

// The result photo is laid out at its natural 3:4 shape (width W, height imgH)
// and cropped by a shorter panel. The ghost is placed against what is seen, so
// the dark region (normalised to the whole image) is mapped into panel space.

// Offset of the image inside the panel (<= 0), centred on `centreY` (normalised
// to the image height) and kept within the image.
export function panelTop(panelH: number, imgH: number, centreY: number | null): number {
  const lo = Math.min(0, panelH - imgH);
  const want = Math.round(panelH / 2 - (centreY ?? 0.5) * imgH);
  return Math.min(0, Math.max(lo, want));
}

// Region in panel space (normalised to W x panelH), clipped to the panel; null
// when less than a tenth of the panel height of it is visible.
export function panelRegion(region: RegionInput | null, imgH: number, panelH: number, top: number): RegionInput | null {
  if (!region) return null;
  const y0 = (region.y * imgH + top) / panelH;
  const y1 = ((region.y + region.h) * imgH + top) / panelH;
  const c0 = Math.max(0, y0);
  const c1 = Math.min(1, y1);
  if (c1 - c0 < 0.1) return null;
  const visible = (c1 - c0) / Math.max(1e-6, y1 - y0);
  const cy = Math.min(c1, Math.max(c0, (region.cy * imgH + top) / panelH));
  return {
    x: region.x,
    y: c0,
    w: region.w,
    h: c1 - c0,
    cx: region.cx,
    cy,
    areaFraction: Math.min(1, region.areaFraction * (imgH / panelH) * visible),
  };
}

// Where the figure centre should sit, as a fraction of the panel height from the
// edge it is nearer to: inside the 15 to 40% band (D-009).
export const FIGURE_EDGE_FRAC = 0.38;

// Second pass of the crop: slide the photo so the figure (a box in panel space for
// the current `top`) centres at 38% in from the nearer panel edge, kept inside the
// image and keeping the figure box inside the panel. `dy` is how far the figure
// moves with the photo.
export function cropOnFigure(panelH: number, imgH: number, top: number, fig: { y: number; h: number }): { top: number; dy: number } {
  const lo = Math.min(0, panelH - imgH);
  const centre = fig.y + fig.h / 2;
  const minDy = Math.max(lo - top, -fig.y);
  const maxDy = Math.min(0 - top, panelH - fig.h - fig.y);
  // Either side of the panel works; take the one the image bounds let us reach best.
  let best = 0;
  let miss = Infinity;
  for (const frac of [FIGURE_EDGE_FRAC, 1 - FIGURE_EDGE_FRAC]) {
    const dy = Math.min(maxDy, Math.max(minDy, Math.round(panelH * frac - centre)));
    const off = Math.abs(centre + dy - panelH * frac);
    if (off < miss - 0.5 || (Math.abs(off - miss) <= 0.5 && Math.abs(dy) < Math.abs(best))) {
      best = dy;
      miss = off;
    }
  }
  return { top: top + best, dy: best };
}

// Placement seed per case: the record's seed mixed with its case number, so two cases on one
// photo (or one demo seed on two photos) do not land in the same spot with the same variant.
export function caseSeed(seed: number, id: string): number {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (Math.imul(seed >>> 0, 0x9e3779b1) ^ h) >>> 0;
}

// Opacity rises with tier inside the belief band: ACTIVE takes the lower middle, STRONG the upper
// middle, CRITICAL the top. The FX tier caps fall with tier (0.22, 0.20, 0.18), which would make
// STRONG fainter than ACTIVE, so the ladder is passed as `tierCap` (placeGhost clamps it to
// 0.08..0.25, and the band itself never leaves the belief answer's range).
const LADDER: Partial<Record<Tier, [number, number]>> = {
  active: [0.2, 0.6],
  strong: [0.65, 0.85],
  critical: [0.9, 1],
};

export function tierOpacity(tier: Tier, band: readonly [number, number] = DEFAULT_OPACITY_RANGE): { opacityRange?: [number, number]; tierCap?: Partial<Record<Tier, number>> } {
  const at = LADDER[tier];
  if (!at) return {};
  const lo = Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, Math.min(band[0], band[1])));
  const hi = Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, Math.max(band[0], band[1])));
  const a = lo + (hi - lo) * at[0];
  const b = lo + (hi - lo) * at[1];
  return { opacityRange: [a, b], tierCap: { [tier]: b } };
}
