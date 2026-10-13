import type { RegionInput } from '../../fx/ghostV0';

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
