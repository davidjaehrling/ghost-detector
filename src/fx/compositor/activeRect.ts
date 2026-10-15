import { imageRectFor } from '../apparition/shape';
import type { Placement } from '../ghostV0/placement';
import { BAND_SOFT, type Band } from './blend';
import { ghostBlurSigma, layerCopies, smearFor } from './motion';

// P8-03: where COMPOSITE_SKSL can differ from the plain photo. Outside the ghost layer's reach
// (alpha exactly 0 after the blur) and outside the band mass (coverage exactly 0), with the grain
// held back (0), the shader returns `clamp(bg, 0, 1)`: the photo sample itself. The offscreen
// compositor draws the photo through PHOTO_SKSL over the panel and runs the full shader only in this
// rectangle, which gives the same bytes at a fraction of the per-pixel cost on a CPU raster.

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Blur reach in sigmas. Skia's Gaussian (and its triple box approximation) ends inside 3 sigma. */
export const BLUR_REACH = 4;
/** Extra pixels on every side (bilinear taps, rounding). */
export const RECT_PAD = 2;

function union(a: Rect | null, b: Rect): Rect {
  return a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : b;
}

/**
 * The ghost layer's bounds in panel pixels at scale 1, as `buildGhostLayer` draws it (padded
 * apparition box, every copy and echo offset, the vertical smear, the blur), or null.
 */
export function ghostLayerRect(p: Placement, tier: Parameters<typeof ghostBlurSigma>[1], seed: number, blur = 1): Rect {
  const { x, y, w, h } = imageRectFor(p);
  const smear = smearFor(seed);
  const sy0 = Math.min(0, ...smear.offsets);
  const sy1 = Math.max(0, ...smear.offsets);
  let r: Rect | null = null;
  for (const c of layerCopies(p)) r = union(r, { x0: x + c.dx, y0: y + c.dy + sy0, x1: x + c.dx + w, y1: y + c.dy + sy1 + h });
  const reach = Math.ceil(BLUR_REACH * ghostBlurSigma(p.w, tier) * blur) + RECT_PAD;
  return { x0: r!.x0 - reach, y0: r!.y0 - reach, x1: r!.x1 + reach, y1: r!.y1 + reach };
}

/** Bounds of the band mass (coverage above 0) in panel pixels, or null without a band. */
export function bandRect(b: Band | null | undefined): Rect | null {
  if (!b) return null;
  const reachX = b.halfW + BAND_SOFT;
  const dx = reachX / b.halfW;
  const topMin = b.top + Math.min(0, b.hump * dx * dx) - Math.abs(b.rag);
  return { x0: b.cx - reachX - RECT_PAD, y0: topMin - BAND_SOFT - RECT_PAD, x1: b.cx + reachX + RECT_PAD, y1: b.bottom + 2 * BAND_SOFT + RECT_PAD };
}

/** The union clipped to the panel and rounded out to whole pixels, or null when empty. */
export function activeRect(parts: (Rect | null)[], width: number, height: number): Rect | null {
  let r: Rect | null = null;
  for (const p of parts) if (p) r = union(r, p);
  if (!r) return null;
  const out = { x0: Math.max(0, Math.floor(r.x0)), y0: Math.max(0, Math.floor(r.y0)), x1: Math.min(width, Math.ceil(r.x1)), y1: Math.min(height, Math.ceil(r.y1)) };
  return out.x1 > out.x0 && out.y1 > out.y0 ? out : null;
}
