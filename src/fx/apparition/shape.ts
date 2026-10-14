/**
 * Apparition geometry. Pure TS, no Skia: the same polygons feed the Skia path in
 * `renderApparition` and the low-resolution alpha grid in `metrics.ts`, so the unit tests sample
 * the shape the device draws.
 *
 * A figure is a union of closed polygons (stacked, skewed ellipses and Catmull-Rom blobs, which
 * are cubic Bezier curves through their anchors, flattened) plus an optional ragged cut that
 * occludes part of it. Coordinates are normalised to the image box: u = 0..1 across, v = 0..1
 * down, for a box twice as tall as it is wide (`APPARITION_ASPECT`).
 */
import { mulberry32 } from '../../engine';

export type Pt = readonly [number, number];

export interface Part {
  /** Closed polygon in normalised box coordinates; every part is wound the same way. */
  poly: Pt[];
  /** Density 0..1. Body parts are 1; a soft arm hint is lower. */
  weight: number;
  /** Bounds of `poly` (u0, v0, u1, v1), for a quick reject. */
  bounds: readonly [number, number, number, number];
}

/** The lower-body fade: full density above `from`, easing to `floor` at `to` (v down the box). */
export interface Fade {
  from: number;
  to: number;
  floor: number;
}

/** No lower-body fade (the default of `maskAlpha`): floor 1 keeps full density everywhere. */
export const NO_FADE: Fade = { from: 1, to: 2, floor: 1 };
/**
 * Every variant's hem dissolves (D-022): a feathered fade to nothing that starts and ends between
 * 50 and 70% of the body's height (head top to hem), its centre and width seeded, so no drape
 * ever flares into a tail. The fade line itself is ragged (`HEM_RAG`).
 */
export const HEM_DISSOLVE: readonly [number, number] = [0.5, 0.7];
/** Width of the dissolve as a share of the body's height (seeded in this band). */
export const HEM_FEATHER: readonly [number, number] = [0.12, 0.16];
/**
 * The dissolve's fade line moves up and down by up to HEM_RAG box heights (peak to peak; see
 * `maskAlpha`), so the body ends in ragged wisps. The fit leaves half of it free under the fade.
 */
export const HEM_RAG = 0.12;
/** Tendrils: where they leave the body (share of its height), length and base width (body units), density. */
export const TENDRIL_Y: readonly [number, number] = [0.25, 0.55];
export const TENDRIL_LEN: readonly [number, number] = [0.07, 0.11];
export const TENDRIL_W: readonly [number, number] = [0.03, 0.045];
export const TENDRIL_WEIGHT = 1;

export interface Silhouette {
  variant: number;
  seed: number;
  parts: Part[];
  /** Ragged occluder (a polygon reaching outside the box) erased from the figure, or null. */
  cut: Pt[] | null;
  /** Feather blur sigma as a fraction of the box width. */
  feather: number;
  /** Noise displacement amplitude as a fraction of the box width (peak to peak). */
  displace: number;
  /** Edge erosion strength of the noise alpha mask, 0..1. */
  erode: number;
  /** Lowest density the noise mask leaves inside the body. */
  densityFloor: number;
  /** Lower-body fade in box coordinates. */
  fade: Fade;
  /**
   * One side of the body thinner than the other: density falls by up to `lateral` toward the side
   * `lateralSide` (+1 right, -1 left), so the figure never reads as an even, mirrored wash.
   */
  lateral: number;
  lateralSide: 1 | -1;
}

/** Width / height of the apparition box (same as the v0 mattes, so `placeGhost` boxes fit). */
export const APPARITION_ASPECT = 0.5;
export const VARIANT_COUNT = 6;
/**
 * The silhouette's bounding box fills this share of the image width and height, centred; the rest
 * is room for the feather and displacement. A compositor that wants the silhouette to fill a
 * placement box draws the image that much larger (`imageRectFor`).
 */
export const FIT_W = 0.8;
export const FIT_H = 0.88;
/** Most the width may be stretched relative to the height when fitting the box. */
export const MAX_STRETCH = 1.45;
export const VARIANT_NAMES = ['lean', 'hunch', 'hood', 'turned', 'behind', 'trail'] as const;
/** Variants that carry a seeded ragged occluder. */
export const OCCLUDED_VARIANTS: readonly number[] = [2, 4];

// Work in an isotropic space (X 0..0.5, Y 0..1) so rotations keep their shape, then map back.
type P = [number, number];
const ISO_W = APPARITION_ASPECT;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function ellipse(cx: number, cy: number, rx: number, ry: number, rot: number, wob: number, rnd: () => number, n = 44): P[] {
  const ph = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const w = 1 + wob * (0.6 * Math.sin(2 * t + ph[0]!) + 0.3 * Math.sin(3 * t + ph[1]!) + 0.2 * Math.sin(5 * t + ph[2]!));
    const x = Math.cos(t) * rx * w;
    const y = Math.sin(t) * ry * w;
    out.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return out;
}

/** Closed Catmull-Rom spline through the anchors (as cubic Beziers), flattened. */
function blob(anchors: P[], steps = 8): P[] {
  const n = anchors.length;
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = anchors[(i - 1 + n) % n]!;
    const p1 = anchors[i]!;
    const p2 = anchors[(i + 1) % n]!;
    const p3 = anchors[(i + 2) % n]!;
    // Bezier control points of the Catmull-Rom segment p1 -> p2.
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const mt = 1 - t;
      const a = mt * mt * mt;
      const b = 3 * mt * mt * t;
      const c = 3 * mt * t * t;
      const d = t * t * t;
      out.push([a * p1[0] + b * c1[0] + c * c2[0] + d * p2[0], a * p1[1] + b * c1[1] + c * c2[1] + d * p2[1]]);
    }
  }
  return out;
}

function signedArea(poly: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/** Same winding for every part, so a nonzero fill draws their union. */
function wind(poly: P[]): P[] {
  return signedArea(poly) < 0 ? poly.slice().reverse() : poly;
}

interface Body {
  side: 1 | -1;
  parts: { poly: P[]; weight: number }[];
  cut: P[] | null;
  /** The body dissolves between these heights (body y, before the fit). */
  dissolve: [number, number];
}

/** Torso and drape: one blob from the neck to a ragged hem. */
function torso(
  rnd: () => number,
  o: { cx: number; neckY: number; shoulderY: number; tiltL: number; tiltR: number; widthL: number; widthR: number; flareL: number; flareR: number; hemY: number; narrow?: number },
): P[] {
  const k = o.narrow ?? 1;
  const { cx } = o;
  const j = () => (rnd() - 0.5) * 0.02;
  return blob([
    [cx - 0.03 * k, o.neckY],
    [cx - o.widthL * k, o.shoulderY + o.tiltL],
    [cx - (o.widthL - 0.035) * k + j(), lerp(o.shoulderY, o.hemY, 0.3)],
    [cx - (o.widthL - 0.075) * k + j(), lerp(o.shoulderY, o.hemY, 0.58)],
    [cx - (o.widthL + o.flareL) * k, o.hemY - 0.03 + j()],
    [cx - 0.05 * k + j(), o.hemY - 0.13 + 2 * j()],
    [cx + 0.03 * k + j(), o.hemY + 0.01 + j()],
    [cx + (o.widthR + o.flareR) * k, o.hemY - 0.04 + j()],
    [cx + (o.widthR - 0.08) * k + j(), lerp(o.shoulderY, o.hemY, 0.6)],
    [cx + (o.widthR - 0.04) * k + j(), lerp(o.shoulderY, o.hemY, 0.32)],
    [cx + o.widthR * k, o.shoulderY + o.tiltR],
    [cx + 0.03 * k, o.neckY],
  ]);
}

/** Ragged occluder: a jagged line between two edge points, closed around the given box corners. */
function raggedCut(rnd: () => number, a: P, b: P, corners: P[], amp: number): P[] {
  const n = 14;
  const nx = -(b[1] - a[1]);
  const ny = b[0] - a[0];
  const len = Math.hypot(nx, ny) || 1;
  const line: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const off = i === 0 || i === n ? 0 : (rnd() - 0.5) * 2 * amp + Math.sin(t * 9 + rnd()) * amp * 0.4;
    line.push([lerp(a[0], b[0], t) + (nx / len) * off, lerp(a[1], b[1], t) + (ny / len) * off]);
  }
  return [...line, ...corners];
}

function buildBody(variant: number, rnd: () => number): Body {
  const side = rnd() < 0.5 ? -1 : 1; // which way this figure leans; mirroring keeps it asymmetric
  const cx = 0.25;
  const tilt = lerp(0.025, 0.06, rnd()) * (rnd() < 0.5 ? -1 : 1);
  const base = {
    cx,
    neckY: 0.17,
    shoulderY: 0.25,
    tiltL: tilt > 0 ? tilt : 0,
    tiltR: tilt < 0 ? -tilt : 0,
    widthL: lerp(0.105, 0.13, rnd()),
    widthR: lerp(0.1, 0.125, rnd()),
    flareL: lerp(0.0, 0.03, rnd()),
    flareR: lerp(0.005, 0.035, rnd()),
    hemY: lerp(0.9, 0.96, rnd()),
  };
  const head = (dx: number, y: number, s = 1) =>
    ellipse(cx + dx, y, lerp(0.05, 0.062, rnd()) * s, lerp(0.068, 0.08, rnd()) * s, (rnd() - 0.5) * 0.6, 0.09, rnd);
  const parts: Body['parts'] = [];
  let cut: P[] | null = null;
  let lean = lerp(0.13, 0.17, rnd()) * side;
  let bend = 0;

  switch (variant) {
    case 0: {
      // lean: strong lean, uneven shoulders, drape flaring to one side.
      lean = lerp(0.2, 0.25, rnd()) * side;
      parts.push({ poly: torso(rnd, { ...base, narrow: lerp(0.8, 0.88, rnd()), flareL: side < 0 ? base.flareL + 0.03 : 0, flareR: side > 0 ? base.flareR + 0.03 : 0 }), weight: 1 });
      parts.push({ poly: head(side * lerp(0.01, 0.03, rnd()), 0.11), weight: 1 });
      break;
    }
    case 1: {
      // hunch: head low and forward, one shoulder raised into a hump.
      const hx = side * lerp(0.05, 0.07, rnd());
      parts.push({ poly: torso(rnd, { ...base, neckY: 0.22, shoulderY: 0.29, hemY: base.hemY - 0.02 }), weight: 1 });
      parts.push({ poly: head(hx, 0.19, 0.95), weight: 1 });
      parts.push({ poly: ellipse(cx + side * 0.075, 0.28, 0.055, 0.04, side * 0.5, 0.12, rnd), weight: 1 });
      lean = lerp(0.18, 0.22, rnd()) * side;
      break;
    }
    case 2: {
      // hood: head merged into a hood that runs into the shoulders; ragged cut across the lower body.
      const hx = (rnd() - 0.5) * 0.04;
      parts.push({ poly: torso(rnd, { ...base, narrow: 0.9, flareL: base.flareL * 0.5, flareR: base.flareR * 0.5 }), weight: 1 });
      parts.push({
        poly: blob([
          [cx + hx - 0.015, 0.04],
          [cx + hx + 0.04, 0.09],
          [cx + hx + 0.055, 0.2],
          [cx + 0.08, 0.3],
          [cx - 0.05, 0.28],
          [cx + hx - 0.05, 0.16],
        ]),
        weight: 1,
      });
      // A ragged, steeply slanted edge across the waist (a table or bed edge in front of it): it
      // crosses the body's centre line at 50 to 56% of its height, above the hem dissolve, so it
      // cuts what is visible; the body below it is hidden.
      const yMid = lerp(0.5, 0.56, rnd());
      const drop = lerp(0.32, 0.4, rnd());
      const y0 = yMid - drop;
      const y1 = yMid + drop;
      // Leans harder than the default: the hem dissolve leaves only the upper body, whose outline
      // the lean and the slanted cut keep asymmetric.
      lean = lerp(0.22, 0.26, rnd()) * side;
      cut =
        side > 0
          ? raggedCut(rnd, [-0.1, y1], [0.6, y0], [[0.6, 1.3], [-0.1, 1.3]], 0.018)
          : raggedCut(rnd, [-0.1, y0], [0.6, y1], [[0.6, 1.3], [-0.1, 1.3]], 0.018);
      break;
    }
    case 3: {
      // turned: narrow, half turned body with one soft arm hint along a side.
      const narrow = lerp(0.76, 0.83, rnd());
      parts.push({ poly: torso(rnd, { ...base, narrow }), weight: 1 });
      parts.push({ poly: head(side * 0.02, 0.11, 0.92), weight: 1 });
      const ax = cx + side * (base.widthL * narrow - 0.03);
      parts.push({ poly: ellipse(ax, 0.47, 0.03, 0.2, -side * 0.12, 0.1, rnd), weight: 0.45 });
      // A harder lean than the default: the upper body left by the hem dissolve stays a slanted
      // shape, not a block filling its box.
      lean = lerp(0.17, 0.21, rnd()) * side;
      break;
    }
    case 4: {
      // behind: a plain figure standing behind something low on one side; a ragged occluder
      // rises from the bottom and hides that side of the lower body.
      parts.push({ poly: torso(rnd, base), weight: 1 });
      parts.push({ poly: head((rnd() - 0.5) * 0.04, 0.11), weight: 1 });
      // Above the hem dissolve, so the occluder cuts the visible body.
      const top = lerp(0.34, 0.42, rnd());
      const reach = lerp(0.2, 0.25, rnd()); // how far across the 0.5 wide box the occluder reaches
      lean = lerp(0.2, 0.24, rnd()) * side;
      // On one side, below the chest: it moves with the lean (below), so it always covers that side
      // of the visible torso and the outline above the hem dissolve stays lopsided.
      cut =
        side < 0
          ? raggedCut(rnd, [-0.1, top + 0.03], [reach, top], [[reach + 0.02, 1.1], [-0.1, 1.1]], 0.014)
          : raggedCut(rnd, [0.6, top + 0.03], [0.5 - reach, top], [[0.48 - reach, 1.1], [0.6, 1.1]], 0.014);
      break;
    }
    default: {
      // trail: tall and thin, small tilted head, the drape trailing off to one side.
      bend = lerp(0.05, 0.08, rnd()) * -side;
      parts.push({
        poly: torso(rnd, { ...base, narrow: 0.83, hemY: 0.97, flareL: side < 0 ? 0.08 : 0.0, flareR: side > 0 ? 0.09 : 0.0 }),
        weight: 1,
      });
      parts.push({ poly: head(side * 0.015, 0.1, 0.85), weight: 1 });
      break;
    }
  }

  // Hem dissolve: a seeded feather inside 50 to 70% of the body's height (head top to hem).
  let top = Infinity;
  let bottom = -Infinity;
  for (const p of parts)
    for (const [, y] of p.poly) {
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  const fw = lerp(HEM_FEATHER[0], HEM_FEATHER[1], rnd());
  const mid = lerp(HEM_DISSOLVE[0] + fw / 2, HEM_DISSOLVE[1] - fw / 2, rnd());
  const dissolve: [number, number] = [top + (bottom - top) * (mid - fw / 2), top + (bottom - top) * (mid + fw / 2)];

  // Tendrils (D-022): two or three seeded wisps leaving one side of the body between 25 and 55%
  // of its height, drooping, tapering to a point, softer than the body. They break the outline at a
  // scale the ghost layer's blur and smear keep (the noise roughens it below that).
  const torsoPoly = parts[0]!.poly;
  const nT = 2 + Math.floor(rnd() * 2);
  for (let k = 0; k < nT; k++) {
    // On the side the figure leans away from (a wake), so they never mirror each other.
    const sideK = side;
    const yT = top + (bottom - top) * lerp(TENDRIL_Y[0], TENDRIL_Y[1], rnd());
    // The torso vertex on that side nearest yT.
    let base: P | null = null;
    for (const q of torsoPoly) if ((q[0] - cx) * sideK > 0 && (!base || Math.abs(q[1] - yT) < Math.abs(base[1] - yT))) base = q;
    if (!base) continue;
    const len = lerp(TENDRIL_LEN[0], TENDRIL_LEN[1], rnd());
    const bw = lerp(TENDRIL_W[0], TENDRIL_W[1], rnd());
    const ang = lerp(0.35, 0.9, rnd()); // droop below horizontal, radians
    const dx = Math.cos(ang) * sideK;
    const dy = Math.sin(ang);
    const nx = -dy;
    const ny = dx;
    const bend = (rnd() - 0.5) * 0.4 * len;
    const at = (t: number, off: number): P => [base[0] + dx * len * t + nx * (off + bend * t * t), base[1] + dy * len * t + ny * (off + bend * t * t)];
    parts.push({
      poly: blob([at(-0.35, 0), at(0, bw / 2), at(0.5, bw / 4), at(1, 0), at(0.5, -bw / 4), at(0, -bw / 2)], 6),
      weight: TENDRIL_WEIGHT,
    });
  }

  // Lean (the top moves sideways, the hem stays) plus a soft bend through the middle.
  const warp = ([x, y]: P): P => [x + lean * (0.95 - y) + bend * Math.sin(Math.PI * Math.min(1, Math.max(0, y))), y];
  return {
    side: side < 0 ? -1 : 1,
    parts: parts.map((p) => ({ poly: p.poly.map(warp), weight: p.weight })),
    // The cuts move with the lean so they always land on the body.
    cut: cut ? cut.map(warp) : cut,
    dissolve,
  };
}

/** The figure for a variant (0..5) and seed. Deterministic. */
export function buildSilhouette(variant: number, seed: number): Silhouette {
  const v = ((Math.floor(variant) % VARIANT_COUNT) + VARIANT_COUNT) % VARIANT_COUNT;
  const rnd = mulberry32((seed ^ Math.imul(v + 1, 0x9e3779b1)) >>> 0);
  const body = buildBody(v, rnd);

  // Fit the parts into the box with room for the feather (FIT_W x FIT_H, centred).
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  // Extents of what stays visible: points under the cut do not count, so an occluded figure
  // still fills its box.
  // The body counts only down to the end of its hem fade, so what stays visible fills the box.
  const yMax = body.dissolve[1];
  for (const p of body.parts)
    for (const [x, y] of p.poly) {
      if (body.cut && insidePoly(body.cut, x, y)) continue;
      if (y > yMax) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  // Height sets the scale; the width may stretch up to MAX_STRETCH so a slim figure still fills
  // its box (the v0 mattes allowed 1.3x). Axis scaling leaves the metrics (area share of the
  // bounding box, mirror correlation, holes) unchanged.
  // The fade's end sits HEM_RAG / 2 above the bottom of the fitted box, so the ragged hem's
  // lowest wisps end inside it.
  const sy = (FIT_H - HEM_RAG / 2) / (y1 - y0);
  const sx = Math.min((ISO_W * FIT_W) / (x1 - x0), sy * MAX_STRETCH);
  const ox = ISO_W / 2 - ((x0 + x1) / 2) * sx;
  const oy = (1 - FIT_H) / 2 - y0 * sy;
  const toBox = ([x, y]: P): Pt => [(x * sx + ox) / ISO_W, y * sy + oy];

  return {
    variant: v,
    seed,
    parts: body.parts.map((p) => {
      const poly = wind(p.poly).map(toBox);
      return { poly, weight: p.weight, bounds: boundsOf(poly) };
    }),
    cut: body.cut ? wind(body.cut).map(toBox) : null,
    feather: lerp(0.025, 0.035, rnd()),
    displace: lerp(0.09, 0.12, rnd()),
    erode: lerp(0.25, 0.35, rnd()),
    densityFloor: lerp(0.88, 0.95, rnd()),
    fade: { from: body.dissolve[0] * sy + oy, to: body.dissolve[1] * sy + oy, floor: 0 },
    lateral: lerp(0.2, 0.35, rnd()),
    // Thinner on the side the head leans away from.
    lateralSide: body.side < 0 ? 1 : -1,
  };
}

function boundsOf(poly: readonly Pt[]): [number, number, number, number] {
  let u0 = Infinity;
  let v0 = Infinity;
  let u1 = -Infinity;
  let v1 = -Infinity;
  for (const [u, v] of poly) {
    u0 = Math.min(u0, u);
    v0 = Math.min(v0, v);
    u1 = Math.max(u1, u);
    v1 = Math.max(v1, v);
  }
  return [u0, v0, u1, v1];
}

/** Image rect that puts the silhouette's fitted box on `box` (the feather spills outside it). */
export function imageRectFor(box: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const w = box.w / FIT_W;
  const h = box.h / FIT_H;
  return { x: box.x - (w - box.w) / 2, y: box.y - (h - box.h) / 2, w, h };
}

/** Even-odd point in polygon. */
export function insidePoly(poly: readonly Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Coverage of the union at a normalised point: the highest part weight, 0 inside the cut. */
export function coverageAt(sil: Silhouette, u: number, v: number): number {
  if (sil.cut && insidePoly(sil.cut, u, v)) return 0;
  let w = 0;
  for (const p of sil.parts) {
    const [u0, v0, u1, v1] = p.bounds;
    if (p.weight > w && u >= u0 && u <= u1 && v >= v0 && v <= v1 && insidePoly(p.poly, u, v)) w = p.weight;
  }
  return w;
}
