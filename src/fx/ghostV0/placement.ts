/**
 * v0 ghost placement. Pure and seeded: same input, same output.
 * Rules (plan section 6, psych brief 2.2): the figure, motion copies included, covers at most
 * 15% of the frame, sits in the dark region but off its centroid, is never centred in the
 * frame, keeps its centre 15 to 40% in from the left or right edge and 10% clear of the top and
 * bottom (D-009: never jammed against the bezel), and stays faint (8 to 25% opacity, capped
 * lower by tier when the caller passes one).
 */
import { mulberry32, type Tier } from '../../engine';

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
  /** Multiplier on `Placement.opacity`, decreasing with distance. All copies sum to `COPY_ALPHA_SUM`. */
  alpha: number;
}

export interface Placement {
  /** Main figure box in pixels, top-left origin. */
  x: number;
  y: number;
  w: number;
  h: number;
  matte: 1 | 2 | 3;
  /** 0.08..0.25, at most the tier cap when `PlaceOptions.tier` is given. */
  opacity: number;
  flipX: boolean;
  /** 3 to 5 copies (2 to 4 on CRITICAL) along one direction: the v0 stand-in for motion blur. */
  offsetCopies: OffsetCopy[];
  /**
   * CRITICAL only (D-017, D-022): a second copy of the whole figure 8 to 12 px off it at 45% of
   * the main figure's alpha, a double exposure that reads at 1x. It takes `ECHO_SHARE` out of the
   * motion copies' `COPY_ALPHA_SUM` budget; the rest of its alpha is extra (see `ECHO_ALPHA`).
   */
  echo?: OffsetCopy;
}

export interface PlaceOptions {
  /** Opacity band, clamped to 0.08..0.25 (default `DEFAULT_OPACITY_RANGE`). Psych brief 2.2 sets it by belief answer. */
  opacityRange?: [number, number];
  /**
   * SPI tier of the result. When given, the opacity band's top is capped by `tierCap` (hint, not
   * show: the tier lives in the SPI, not in the ghost's brightness) and CRITICAL drops one motion
   * copy so the figure smears less. The result screen should pass it.
   */
  tier?: Tier;
  /** Per-tier opacity ceiling, merged over `TIER_OPACITY_CAP`. Only read when `tier` is given. */
  tierCap?: Partial<Record<Tier, number>>;
}

/**
 * Extent by tier (D-017): the share of the frame the figure and its copies (and the CRITICAL echo)
 * cover, so the tiers escalate in size. The panel asked for about 11, 14 and 17%; plan section 6
 * caps the ghost at 15% of the frame, so STRONG and CRITICAL sit at 13 and 14.5% (logged for a
 * ruling). QUIET and TRACE keep the region-based size (the result screen shrinks them to a smudge).
 */
export const TIER_EXTENT: Readonly<Partial<Record<Tier, number>>> = { active: 0.11, strong: 0.13, critical: 0.145 };
/**
 * CRITICAL echo: offset in px (direction seeded) and alpha as a multiple of the main figure's
 * opacity. Round 2's 6 to 10 px at 0.15 vanished under the blur and smear (D-022); at 8 to 12 px
 * and 0.45 it reads as a double exposure. It takes ECHO_SHARE out of the motion copies' budget, so
 * the stacked alpha stays under `opacity * (1 + COPY_ALPHA_SUM - ECHO_SHARE + ECHO_ALPHA)` =
 * 1.65 x opacity, 0.297 at the CRITICAL cap of 0.18; the per-pixel clamp bounds the light anyway.
 */
export const ECHO_PX: readonly [number, number] = [12, 16];
/** A-47 (P8): 12 to 16 px (about 14) and 0.55, so the doubled CRITICAL figure reads at 390; the stacked alpha stays at or under 0.3. */
export const ECHO_ALPHA = 0.55;
export const ECHO_SHARE = 0.15;
/** Least angle between the echo and the drift line, radians (A-47). */
export const ECHO_SEP = (15 * Math.PI) / 180;

/** Default opacity ceilings by tier (D-009). QUIET only ever shows a smudge, so it shares TRACE's. */
export const TIER_OPACITY_CAP: Readonly<Record<Tier, number>> = {
  quiet: 0.1,
  trace: 0.1,
  active: 0.22,
  strong: 0.2,
  critical: 0.18,
};

export const OPACITY_MIN = 0.08;
export const OPACITY_MAX = 0.25;
/**
 * Band used when the caller passes no `opacityRange` (no belief answer yet). Its floor sits above
 * OPACITY_MIN so the figure still reads at 1x: on the cellar fixture a matte at 0.09 lifts the
 * figure box by about 7 luma, under the 8 to 30 target (D-007). Belief bands go lower on purpose.
 * Raised from 0.13 to 0.17 in round 2: the interior density patches (D-017) take part of the
 * light back, and the result screen's ACTIVE ladder sits in the lower half of this band.
 */
export const DEFAULT_OPACITY_RANGE: readonly [number, number] = [0.17, 0.25];
/** Hard cap from plan section 6, measured on the union of the figure and its copies. */
export const MAX_AREA_FRACTION = 0.15;
/**
 * Alpha budget for the motion copies, as a fraction of the main figure's opacity. Copies stack
 * with normal "over" inside the ghost layer, so where the figure and every copy overlap the
 * layer alpha is 1 - (1 - o) * prod(1 - o * a_i) <= o * (1 + sum(a_i)) = o * (1 + COPY_ALPHA_SUM)
 * (union bound). With o <= OPACITY_MAX that is at most 0.25 * 1.35 = 0.3375 anywhere.
 */
export const COPY_ALPHA_SUM = 0.35;
/** Falloff between neighbouring copies: each is this fraction of the one before. */
export const COPY_FALLOFF = 0.72;
/**
 * A figure whose centre is closer than this (fraction of frame width) to the midline counts as
 * centred. The margin band (`EDGE_MARGIN_X`, centre at most 40% in) keeps 10% clear, so this holds.
 */
export const CENTRE_EXCLUSION = 0.08;
/** Matte aspect, width / height (512 x 1024). */
export const MATTE_ASPECT = 0.5;
/** Figure centre: this far in from the left or right frame edge, as a fraction of the width (D-009). */
export const EDGE_MARGIN_X: readonly [number, number] = [0.15, 0.4];
/** Figure centre: at least this far from the top and bottom, as a fraction of the height. */
export const EDGE_MARGIN_Y = 0.1;
/** A region edge within this fraction of the frame edge counts as hugging it. */
const HUG = 0.05;

type Span = [number, number];

/** Intersection of each span with [lo, hi]; empty spans dropped. */
function clip(spans: Span[], lo: number, hi: number): Span[] {
  const out: Span[] = [];
  for (const [a, b] of spans) {
    const l = Math.max(a, lo);
    const r = Math.min(b, hi);
    if (l <= r) out.push([l, r]);
  }
  return out;
}

/** Nearest point to v in a non-empty span list. */
function nearest(v: number, spans: Span[]): number {
  let best = spans[0]![0];
  for (const [a, b] of spans) {
    const p = Math.min(b, Math.max(a, v));
    if (Math.abs(p - v) < Math.abs(best - v)) best = p;
  }
  return best;
}

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

  const [oLo, oHi] = opts.opacityRange ?? DEFAULT_OPACITY_RANGE;
  const cap = opts.tier
    ? clamp(opts.tierCap?.[opts.tier] ?? TIER_OPACITY_CAP[opts.tier], OPACITY_MIN, OPACITY_MAX)
    : OPACITY_MAX;
  const hi = clamp(Math.max(oLo, oHi), OPACITY_MIN, cap);
  const lo = clamp(Math.min(oLo, oHi), OPACITY_MIN, hi);
  const opacity = lerp(lo, hi, rnd());
  const matte = (1 + Math.floor(rnd() * 3)) as 1 | 2 | 3;
  const flipX = rnd() < 0.5;

  // Motion copies: one drift direction, mostly sideways, within 35 degrees of horizontal.
  // CRITICAL drops one so the brightest tier reads as a hint, not a smear.
  const nCopies = 3 + Math.floor(rnd() * 3) - (opts.tier === 'critical' ? 1 : 0);
  const angle = (rnd() * 2 - 1) * (35 * Math.PI) / 180 + (rnd() < 0.5 ? Math.PI : 0);
  const stepFrac = lerp(0.012, 0.024, rnd());

  // Height: from the region when there is one, else 30 to 40% of the frame.
  let h = region ? region.h * H * lerp(0.75, 1.05, rnd()) : H * lerp(0.3, 0.4, rnd());
  h = Math.max(h, H * 0.12);

  // CRITICAL echo: its own random stream, so the other tiers draw exactly as before.
  const er = mulberry32((seed ^ 0x3c6ef372) >>> 0);
  const echoBase =
    opts.tier === 'critical'
      ? (() => {
          const d = lerp(ECHO_PX[0], ECHO_PX[1], er());
          // Mostly sideways, never along the drift (that is what the copies already do).
          let a = (er() * 2 - 1) * (25 * Math.PI) / 180 + (er() < 0.5 ? Math.PI : 0);
          // A-47: keep the copies asymmetric. The echo stays at least ECHO_SEP off the drift line
          // (either way along it), so it never lands on a motion copy or on a copy's mirror image.
          const wrap = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
          const near = [angle, angle + Math.PI].map((r) => wrap(a - r)).sort((p, q) => Math.abs(p) - Math.abs(q))[0]!;
          if (Math.abs(near) < ECHO_SEP) a += (near >= 0 ? 1 : -1) * ECHO_SEP - near;
          return { dx: Math.cos(a) * d, dy: Math.sin(a) * d };
        })()
      : null;

  // Union box of the figure, its copies and the echo for a figure height.
  const unionOf = (fh: number) => {
    const step = fh * stepFrac;
    const cx = Math.cos(angle) * step * nCopies;
    const cy = Math.sin(angle) * step * nCopies;
    const xs = [0, cx, echoBase?.dx ?? 0];
    const ys = [0, cy, echoBase?.dy ?? 0];
    return { uw: fh * MATTE_ASPECT + Math.max(...xs) - Math.min(...xs), uh: fh + Math.max(...ys) - Math.min(...ys) };
  };
  // Tier extent: size the union to the tier's share of the frame (the cap below still applies).
  const extent = opts.tier ? TIER_EXTENT[opts.tier] : undefined;
  if (extent) {
    h = Math.sqrt((extent * W * H) / MATTE_ASPECT);
    for (let i = 0; i < 8; i++) {
      const { uw, uh } = unionOf(h);
      h *= Math.sqrt((extent * W * H) / (uw * uh));
    }
  }

  // Shrink until the union box fits the area cap with a little margin.
  const areaCap = MAX_AREA_FRACTION * 0.97 * W * H;
  // Width also kept under 75% of the frame so a centre in the margin band always fits.
  for (let i = 0; i < 60; i++) {
    const { uw, uh } = unionOf(h);
    if (uw * uh <= areaCap && uw <= W * 0.75 && uh <= H) break;
    h *= 0.95;
  }
  const w = h * MATTE_ASPECT;

  const step = h * stepFrac;
  const offsetCopies: OffsetCopy[] = [];
  let weightSum = 0;
  const copyBudget = COPY_ALPHA_SUM - (echoBase ? ECHO_SHARE : 0);
  for (let i = 0; i < nCopies; i++) weightSum += Math.pow(COPY_FALLOFF, i);
  for (let i = 1; i <= nCopies; i++) {
    offsetCopies.push({
      dx: Math.cos(angle) * step * i,
      dy: Math.sin(angle) * step * i,
      alpha: (copyBudget * Math.pow(COPY_FALLOFF, i - 1)) / weightSum,
    });
  }
  const echo: OffsetCopy | undefined = echoBase ? { ...echoBase, alpha: ECHO_ALPHA } : undefined;

  // Union box extents of the copies (and the echo) relative to the main figure.
  const dxs = [...offsetCopies.map((c) => c.dx), echo?.dx ?? 0];
  const dys = [...offsetCopies.map((c) => c.dy), echo?.dy ?? 0];
  const minDx = Math.min(0, ...dxs);
  const maxDx = Math.max(0, ...dxs);
  const minDy = Math.min(0, ...dys);
  const maxDy = Math.max(0, ...dys);
  // Allowed centres: the margin bands (which also keep the centre clear of the midline), narrowed
  // to where the figure and its copies stay inside the frame.
  const [mIn, mOut] = EDGE_MARGIN_X;
  const fitSpansX = (): Span[] => {
    const spans = clip(
      [
        [mIn * W, mOut * W],
        [(1 - mOut) * W, (1 - mIn) * W],
      ],
      w / 2 - minDx,
      W - w / 2 - maxDx,
    );
    // Never empty: copies drift one way and the union is at most 75% of W, so the band on the
    // side away from the drift always fits. The fallback only guards against bad input.
    return spans.length ? spans : [[w / 2 - minDx, w / 2 - minDx]];
  };
  const fitSpansY = (): Span[] => {
    const spans = clip([[EDGE_MARGIN_Y * H, (1 - EDGE_MARGIN_Y) * H]], h / 2 - minDy, H - h / 2 - maxDy);
    return spans.length ? spans : [[h / 2 - minDy, h / 2 - minDy]];
  };
  const spansX = fitSpansX();
  const spansY = fitSpansY();
  // Nearest allowed centre, inside the region if any allowed centre is, else as close to it as allowed.
  const settle = (v: number, spans: Span[], r0: number, r1: number) => {
    const inside = clip(spans, r0, r1);
    return nearest(v, inside.length ? inside : spans);
  };

  let cx: number;
  let cy: number;
  if (region) {
    const rx0 = region.x * W;
    const rx1 = (region.x + region.w) * W;
    const ry0 = region.y * H;
    const ry1 = (region.y + region.h) * H;
    // Off the centroid by 10 to 30% of the region size on each axis, inside the region box.
    // A region that hugs one frame edge prefers its inner side; if the margins swallow the
    // offset, try the other side.
    const axis = (c: number, r0: number, r1: number, full: number, spans: Span[]) => {
      const size = r1 - r0;
      const coin = rnd() < 0.5 ? -1 : 1;
      const mag = lerp(0.1, 0.3, rnd()) * size;
      const hugLo = r0 <= HUG * full;
      const hugHi = r1 >= (1 - HUG) * full;
      const sign = hugLo !== hugHi ? (hugLo ? 1 : -1) : coin;
      let best = settle(clamp(c + sign * mag, r0, r1), spans, r0, r1);
      for (const sgn of [sign, -sign]) {
        const pos = settle(clamp(c + sgn * mag, r0, r1), spans, r0, r1);
        if (Math.abs(pos - c) >= 0.1 * size) return pos;
        if (Math.abs(pos - c) > Math.abs(best - c)) best = pos;
      }
      return best;
    };
    cx = axis(region.cx * W, rx0, rx1, W, spansX);
    cy = axis(region.cy * H, ry0, ry1, H, spansY);
  } else {
    // Fallback: lower third, left or right of the midline.
    const side = rnd() < 0.5 ? -1 : 1;
    cx = nearest(W * (0.5 + side * lerp(0.14, 0.3, rnd())), spansX);
    cy = nearest(H * lerp(0.88, 0.97, rnd()), spansY);
  }
  const x = cx - w / 2;
  const y = cy - h / 2;

  return echo ? { x, y, w, h, matte, opacity, flipX, offsetCopies, echo } : { x, y, w, h, matte, opacity, flipX, offsetCopies };
}

/**
 * Layer alpha where the figure, all its copies and the echo overlap: 1 - (1 - o) * prod(1 - o * a_i).
 * Bounded by `opacity * (1 + COPY_ALPHA_SUM)`; see `COPY_ALPHA_SUM`.
 */
export function stackedAlpha(placement: Pick<Placement, 'opacity' | 'offsetCopies' | 'echo'>): number {
  let keep = 1 - placement.opacity;
  for (const c of placement.offsetCopies) keep *= 1 - placement.opacity * c.alpha;
  if (placement.echo) keep *= 1 - placement.opacity * placement.echo.alpha;
  return 1 - keep;
}

/** Tint fallback: how far above the region's 90th-percentile luma the grey sits. */
export const FALLBACK_LIFT = 18;

/**
 * Grey for the matte when the platform has no add-light blend mode. Under a normal alpha blend
 * a pixel moves toward the tint, so a tint above the region's brightest pixels lifts all of them:
 * tint = p90 + FALLBACK_LIFT, clamped to 0..255. Returns the luma and a neutral `#rrggbb`.
 */
export function ghostTint(regionP90Luma: number): { luma: number; hex: string } {
  const p90 = clamp(Number.isFinite(regionP90Luma) ? regionP90Luma : 60, 0, 255);
  const luma = Math.round(clamp(p90 + FALLBACK_LIFT, 0, 255));
  const h = luma.toString(16).padStart(2, '0');
  return { luma, hex: `#${h}${h}${h}` };
}
