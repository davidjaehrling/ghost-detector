/**
 * v0 ghost placement. Pure and seeded: same input, same output.
 * Rules (plan section 6, psych brief 2.2): the figure, motion copies included, covers at most
 * 15% of the frame, sits in the dark region but off its centroid, is never centred in the
 * frame, and stays faint (8 to 25% opacity).
 */
import { mulberry32 } from '../../engine';

/** Dark region in normalised 0..1 coordinates (a subset of the engine's `DarkRegion`). */
export interface RegionInput {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  areaFraction: number;
}

export interface Frame {
  /** Frame size in layout pixels. */
  w: number;
  h: number;
}

export interface OffsetCopy {
  /** Offset from the main figure, in pixels. */
  dx: number;
  dy: number;
  /** Multiplier on `Placement.opacity`, decreasing with distance. */
  alpha: number;
}

export interface Placement {
  /** Main figure box in pixels, top-left origin. */
  x: number;
  y: number;
  w: number;
  h: number;
  matte: 1 | 2 | 3;
  /** 0.08..0.25 */
  opacity: number;
  flipX: boolean;
  /** 3 to 5 copies along one direction: the v0 stand-in for motion blur. */
  offsetCopies: OffsetCopy[];
}

export interface PlaceOptions {
  /** Opacity band, clamped to 0.08..0.25. Psych brief 2.2 sets it by belief answer. */
  opacityRange?: [number, number];
}

export const OPACITY_MIN = 0.08;
export const OPACITY_MAX = 0.25;
/** Hard cap from plan section 6, measured on the union of the figure and its copies. */
export const MAX_AREA_FRACTION = 0.15;
/** A figure whose centre is closer than this (fraction of frame width) to the midline counts as centred. */
export const CENTRE_EXCLUSION = 0.08;
/** Matte aspect, width / height (512 x 1024). */
export const MATTE_ASPECT = 0.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function placeGhost(
  region: RegionInput | null,
  frame: Frame,
  seed: number,
  opts: PlaceOptions = {},
): Placement {
  const rnd = mulberry32(seed ^ 0x6a09e667);
  const W = Math.max(1, frame.w);
  const H = Math.max(1, frame.h);

  const [oLo, oHi] = opts.opacityRange ?? [OPACITY_MIN, OPACITY_MAX];
  const lo = clamp(Math.min(oLo, oHi), OPACITY_MIN, OPACITY_MAX);
  const hi = clamp(Math.max(oLo, oHi), OPACITY_MIN, OPACITY_MAX);
  const opacity = lerp(lo, hi, rnd());
  const matte = (1 + Math.floor(rnd() * 3)) as 1 | 2 | 3;
  const flipX = rnd() < 0.5;

  // Motion copies: one drift direction, mostly sideways, within 35 degrees of horizontal.
  const nCopies = 3 + Math.floor(rnd() * 3);
  const angle = (rnd() * 2 - 1) * (35 * Math.PI) / 180 + (rnd() < 0.5 ? Math.PI : 0);
  const stepFrac = lerp(0.012, 0.024, rnd());

  // Height: from the region when there is one, else 30 to 40% of the frame.
  let h = region ? region.h * H * lerp(0.75, 1.05, rnd()) : H * lerp(0.3, 0.4, rnd());
  h = Math.max(h, H * 0.12);

  // Shrink until the union box (figure plus copies) fits the area cap with a little margin.
  const unionOf = (fh: number) => {
    const step = fh * stepFrac;
    const ex = Math.abs(Math.cos(angle)) * step * nCopies;
    const ey = Math.abs(Math.sin(angle)) * step * nCopies;
    return { uw: fh * MATTE_ASPECT + ex, uh: fh + ey };
  };
  const cap = MAX_AREA_FRACTION * 0.97 * W * H;
  for (let i = 0; i < 60; i++) {
    const { uw, uh } = unionOf(h);
    if (uw * uh <= cap && uw <= W && uh <= H) break;
    h *= 0.95;
  }
  const w = h * MATTE_ASPECT;

  const step = h * stepFrac;
  const offsetCopies: OffsetCopy[] = [];
  for (let i = 1; i <= nCopies; i++) {
    offsetCopies.push({
      dx: Math.cos(angle) * step * i,
      dy: Math.sin(angle) * step * i,
      alpha: 0.7 * Math.pow(0.68, i - 1),
    });
  }

  // Union box extents of the copies relative to the main figure.
  const dxs = offsetCopies.map((c) => c.dx);
  const dys = offsetCopies.map((c) => c.dy);
  const minDx = Math.min(0, ...dxs);
  const maxDx = Math.max(0, ...dxs);
  const minDy = Math.min(0, ...dys);
  const maxDy = Math.max(0, ...dys);
  const minOff = CENTRE_EXCLUSION * W + 1;
  const fitX = (cx: number) => clamp(cx - w / 2, -minDx, W - w - maxDx);
  const fitY = (cy: number) => clamp(cy - h / 2, -minDy, H - h - maxDy);

  let x: number;
  let y: number;
  if (region) {
    const rx0 = region.x * W;
    const rx1 = (region.x + region.w) * W;
    const ry0 = region.y * H;
    const ry1 = (region.y + region.h) * H;
    const rw = rx1 - rx0;
    const rh = ry1 - ry0;
    // Off the centroid by 10 to 30% of the region size on each axis, inside the region box.
    // If the frame edge would swallow the offset, try the other side.
    const axis = (c: number, size: number, lo: number, hi: number, fit: (v: number) => number, half: number) => {
      const sign = rnd() < 0.5 ? -1 : 1;
      const mag = lerp(0.1, 0.3, rnd()) * size;
      let best = fit(clamp(c + sign * mag, lo, hi));
      for (const sgn of [sign, -sign]) {
        const pos = fit(clamp(c + sgn * mag, lo, hi));
        if (Math.abs(pos + half - c) >= 0.1 * size) return pos;
        if (Math.abs(pos + half - c) > Math.abs(best + half - c)) best = pos;
      }
      return best;
    };
    x = axis(region.cx * W, rw, rx0, rx1, fitX, w / 2);
    y = axis(region.cy * H, rh, ry0, ry1, fitY, h / 2);
  } else {
    // Fallback: lower third, left or right of the midline.
    const side = rnd() < 0.5 ? -1 : 1;
    x = fitX(W * (0.5 + side * lerp(0.14, 0.3, rnd())));
    y = fitY(H * lerp(0.88, 0.97, rnd()) - h / 2);
  }

  // Never centred in the frame: push the figure to whichever side still fits.
  if (Math.abs(x + w / 2 - W / 2) < minOff) {
    const side = x + w / 2 < W / 2 ? -1 : 1;
    const want = W / 2 + side * minOff - w / 2;
    const other = W / 2 - side * minOff - w / 2;
    x = fitX(want) === want ? want : other;
  }

  return { x, y, w, h, matte, opacity, flipX, offsetCopies };
}

/** Peak lift above the region mean, in luma units (the brightness clamp). */
export const PEAK_LIFT = 14;

/**
 * Grey tint for the matte so the brightest stacked pixel lands about PEAK_LIFT above the
 * region mean under normal alpha blending: result = mean + (tint - mean) * effectiveAlpha.
 * Returns the luma 0..255 and a neutral `#rrggbb` (no saturation).
 */
export function ghostTint(
  regionMeanLuma: number,
  placement: Pick<Placement, 'opacity' | 'offsetCopies'>,
): { luma: number; hex: string } {
  const mean = clamp(Number.isFinite(regionMeanLuma) ? regionMeanLuma : 40, 0, 255);
  let keep = 1 - placement.opacity;
  for (const c of placement.offsetCopies) keep *= 1 - placement.opacity * c.alpha;
  const eff = Math.max(1e-3, 1 - keep);
  const luma = Math.round(clamp(mean + PEAK_LIFT / eff, mean, 255));
  const h = luma.toString(16).padStart(2, '0');
  return { luma, hex: `#${h}${h}${h}` };
}
