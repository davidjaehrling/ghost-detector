/**
 * Thermal field (P3-05). Pure and seeded: same luma grid, region, seed and tier give the same
 * field. Digest section 5: a FLIR-class sensor is about 160 x 120, so the field is built at that
 * size (120 x 160 for a portrait photo) and the view upscales it in blocks.
 *
 * Temperature model, all in °C:
 *   T = ambient + base(luma) + edge(luma) + noise - coldSpot
 * - ambient: seeded, 17 to 23 °C.
 * - base: smoothed luma around its median over its 5 to 95% spread, bright = warm, soft-clamped
 *   to ±4 °C.
 * - edge: the luma's high-pass, up to ±1.8 °C (hot and cold rims at edges).
 * - noise: slow seeded value noise plus a fixed per-pixel pattern, never beyond ±0.4 °C.
 * - coldSpot: a Gaussian dip centred in the dark region (psych brief 2: the cold spot is the
 *   retellable detail), radius 8 to 14% of the frame's short side, depth by tier; from STRONG up
 *   half of it is a body-height smudge (about 1.6:1, upright).
 * The cold spot draws from its own random stream, so the same seed on QUIET and CRITICAL gives
 * the same room with and without the dip; `coldSpotC` is exactly the dip at its centre.
 */
import { mulberry32, type Tier } from '../../engine';

/** Long side of the field in sensor pixels; the short side is `FIELD_SHORT`. */
export const FIELD_LONG = 160;
export const FIELD_SHORT = 120;
/** Seeded ambient band, °C. */
export const AMBIENT_RANGE: readonly [number, number] = [17, 23];
/** Cold-spot radius band as a fraction of the field's short side. */
export const RADIUS_RANGE: readonly [number, number] = [0.08, 0.14];
/** Peak amplitude of the slow noise, °C. */
export const NOISE_AMP = 0.4;
/** Half-span of the luma term, °C (tanh soft clamp). */
export const BASE_SPAN = 4;
/** Bible section 3: ΔT reads -12.0 to +6.0; a cold spot is never colder than -12. */
export const DELTA_MIN = -12;
/**
 * Hot and cold edges (D-017): the luma's high-pass (fine minus coarse) adds up to ±EDGE_C, so an
 * edge between a lit and a dark surface reads as a warm rim against a cold one, as on a real
 * microbolometer. Flat luma gives none.
 */
export const EDGE_C = 1.8;
/** Share of the noise budget that is fixed per-pixel sensor pattern (makes the 160 x 120 blocks show). */
export const FPN_SHARE = 0.3;
/**
 * From STRONG up the cold spot carries a body-height smudge (D-017): an upright ellipse about
 * 1.6:1 that takes SMUDGE_SHARE of the dip, inside the round rest. Both parts are 1 at the
 * centre, so ΔT is unchanged.
 */
export const SMUDGE_FROM: readonly Tier[] = ['strong', 'critical'];
export const SMUDGE_ASPECT = 1.6;
export const SMUDGE_SHARE = 0.75;
/** Smudge half-width as a fraction of the round dip's sigma. */
export const SMUDGE_W = 0.55;
/** With the smudge, the round rest of the dip tightens to this share of its sigma. */
export const SMUDGE_CORE = 0.6;

/** Cold-spot depth in °C by tier (QUIET has none). */
export const TIER_DEPTH: Readonly<Record<Tier, number>> = {
  quiet: 0,
  trace: 1.5,
  active: 3,
  strong: 6,
  critical: 9,
};

/** Luma grid as `downsampleLuma` returns it (96 px on the long side). */
export interface LumaGrid {
  luma: ArrayLike<number>;
  width: number;
  height: number;
}

/** Dark region in normalised 0..1 image coordinates (a subset of the engine's `DarkRegion`). */
export interface ThermalRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface ColdSpot {
  /** Centre, normalised 0..1 to the field (and so to the photo). */
  x: number;
  y: number;
  /** Visible radius, normalised to the field's short side. The Gaussian sigma is 0.6 of it. */
  radius: number;
  /** Depth of the dip at its centre, °C, positive. */
  depthC: number;
}

export interface ThermalField {
  /** Field size in sensor pixels: 160 x 120 or 120 x 160, following the photo. */
  width: number;
  height: number;
  /** Temperatures in °C, row-major. */
  data: Float32Array;
  ambientC: number;
  minC: number;
  maxC: number;
  coldSpot: ColdSpot | null;
  /**
   * Signed ΔT of the cold spot against the room around it, rounded to 0.1 °C (for example -9.0).
   * Null on QUIET. This is the one reading the screen should print next to the view.
   */
  coldSpotC: number | null;
}

export interface ThermalOptions {
  seed: number;
  tier: Tier;
  /**
   * Pin the cold spot's ΔT to a reading the screen already shows (signed, for example -6.4).
   * Clamped to -12..0; zero or above means no cold spot. Ignored on QUIET.
   */
  deltaC?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Bilinear resample of the luma grid to w x h (pixel centres aligned). */
function resample(src: LumaGrid, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const sw = src.width;
  const sh = src.height;
  for (let y = 0; y < h; y++) {
    const fy = clamp(((y + 0.5) * sh) / h - 0.5, 0, sh - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = clamp(((x + 0.5) * sw) / w - 0.5, 0, sw - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      const a = src.luma[y0 * sw + x0]! * (1 - tx) + src.luma[y0 * sw + x1]! * tx;
      const b = src.luma[y1 * sw + x0]! * (1 - tx) + src.luma[y1 * sw + x1]! * tx;
      out[y * w + x] = a * (1 - ty) + b * ty;
    }
  }
  return out;
}

/** Separable box blur with edge clamping, `passes` times (three passes approximate a Gaussian). */
function boxBlur(src: Float32Array, w: number, h: number, r: number, passes: number): Float32Array {
  let a: Float32Array = src;
  let b: Float32Array = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += a[y * w + clamp(x + k, 0, w - 1)]!;
        b[y * w + x] = s / n;
      }
    }
    [a, b] = [b, a];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += a[clamp(y + k, 0, h - 1) * w + x]!;
        b[y * w + x] = s / n;
      }
    }
    [a, b] = [b, a];
  }
  return a;
}

/** Seeded value noise in -1..1: random lattice every `cell` px, smoothstep between nodes. */
function valueNoise(w: number, h: number, cell: number, rnd: () => number): Float32Array {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd() * 2 - 1;
  const out = new Float32Array(w * h);
  const s = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    const gy = y / cell;
    const y0 = Math.floor(gy);
    const ty = s(gy - y0);
    for (let x = 0; x < w; x++) {
      const gx = x / cell;
      const x0 = Math.floor(gx);
      const tx = s(gx - x0);
      const a = grid[y0 * gw + x0]! * (1 - tx) + grid[y0 * gw + x0 + 1]! * tx;
      const b = grid[(y0 + 1) * gw + x0]! * (1 - tx) + grid[(y0 + 1) * gw + x0 + 1]! * tx;
      out[y * w + x] = a * (1 - ty) + b * ty;
    }
  }
  return out;
}

/** 5th, 50th and 95th percentile. */
function percentiles(v: Float32Array): [number, number, number] {
  const s = Float32Array.from(v).sort();
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
  return [at(0.05), at(0.5), at(0.95)];
}

/**
 * Where the cold spot sits: in the dark region near its centroid (seeded jitter of up to 15% of
 * the region size, kept inside the region box); without a region, the darkest point of the
 * smoothed luma inside a 15% margin.
 */
function spotCentre(region: ThermalRegion | null, lum: Float32Array, w: number, h: number, rnd: () => number) {
  const jx = rnd() * 2 - 1;
  const jy = rnd() * 2 - 1;
  if (region) {
    const px = 1 / w;
    const py = 1 / h;
    const x0 = region.x + Math.min(px, region.w / 2);
    const x1 = region.x + region.w - Math.min(px, region.w / 2);
    const y0 = region.y + Math.min(py, region.h / 2);
    const y1 = region.y + region.h - Math.min(py, region.h / 2);
    return {
      x: clamp(region.cx + jx * 0.15 * region.w, x0, x1),
      y: clamp(region.cy + jy * 0.15 * region.h, y0, y1),
    };
  }
  let best = Infinity;
  let bx = 0.5;
  let by = 0.5;
  for (let y = Math.floor(h * 0.15); y < Math.ceil(h * 0.85); y++) {
    for (let x = Math.floor(w * 0.15); x < Math.ceil(w * 0.85); x++) {
      const v = lum[y * w + x]!;
      if (v < best) {
        best = v;
        bx = (x + 0.5) / w;
        by = (y + 0.5) / h;
      }
    }
  }
  return { x: bx, y: by };
}

/** Depth of the cold spot in °C (positive), from the tier or a pinned reading. */
export function coldSpotDepth(tier: Tier, deltaC?: number): number {
  if (tier === 'quiet') return 0;
  if (deltaC === undefined || !Number.isFinite(deltaC)) return TIER_DEPTH[tier];
  return Math.abs(round1(clamp(deltaC, DELTA_MIN, 0)));
}

/** Build the field. `region` is the engine's dark region (normalised), or null. */
export function buildThermalField(grid: LumaGrid, region: ThermalRegion | null, opts: ThermalOptions): ThermalField {
  const portrait = grid.height > grid.width;
  const w = portrait ? FIELD_SHORT : FIELD_LONG;
  const h = portrait ? FIELD_LONG : FIELD_SHORT;
  const short = Math.min(w, h);

  const seed = opts.seed >>> 0;
  const room = mulberry32((seed ^ 0x2545f491) >>> 0);
  const spotRnd = mulberry32((seed ^ 0x9e3779b9) >>> 0);

  const ambientC = AMBIENT_RANGE[0] + room() * (AMBIENT_RANGE[1] - AMBIENT_RANGE[0]);
  const raw = resample(grid, w, h);
  // A light blur for the picture (the sensor's own softness), a heavy one for the edge term.
  // boxBlur reuses its input as scratch, so each gets its own copy.
  const lum = boxBlur(raw.slice(), w, h, 1, 2);
  const coarse = boxBlur(raw.slice(), w, h, 4, 3);
  // Contrast-stretched like a camera's gain: the photo's own 5 to 95% luma spread sets the scale,
  // so a dark cellar still shows its walls. Flat luma stays flat (the floor of 40 levels).
  const [p5, med, p95] = percentiles(lum);
  const lumScale = 1.6 / Math.max(40, p95 - p5);

  // Two octaves plus a fixed per-pixel pattern whose peaks sum to NOISE_AMP. The pattern has its
  // own stream, so the room's slow noise is the same as before it was added.
  const n1 = valueNoise(w, h, 40, room);
  const n2 = valueNoise(w, h, 17, room);
  const fpnRnd = mulberry32((seed ^ 0x51ed270b) >>> 0);
  const fpn = new Float32Array(w * h);
  for (let i = 0; i < fpn.length; i++) fpn[i] = fpnRnd() * 2 - 1;

  const depth = coldSpotDepth(opts.tier, opts.deltaC);
  const centre = spotCentre(region, lum, w, h, spotRnd);
  const radius = RADIUS_RANGE[0] + spotRnd() * (RADIUS_RANGE[1] - RADIUS_RANGE[0]);
  const sigma = 0.6 * radius * short;
  const cxp = centre.x * w;
  const cyp = centre.y * h;
  const inv2s2 = 1 / (2 * sigma * sigma);
  const smudge = depth > 0 && SMUDGE_FROM.includes(opts.tier);
  const sx = SMUDGE_W * sigma;
  const sy = SMUDGE_ASPECT * sx;
  // A slight seeded lean and a narrower top (the head end), so it is not a clean ellipse.
  const lean = (spotRnd() * 2 - 1) * 0.25;

  const data = new Float32Array(w * h);
  let minC = Infinity;
  let maxC = -Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const base = BASE_SPAN * Math.tanh((lum[i]! - med) * lumScale);
      const edge = EDGE_C * Math.tanh((lum[i]! - coarse[i]!) * lumScale * 3);
      const noise = NOISE_AMP * ((1 - FPN_SHARE) * (0.68 * n1[i]! + 0.32 * n2[i]!) + FPN_SHARE * fpn[i]!);
      const dx = x + 0.5 - cxp;
      const dy = y + 0.5 - cyp;
      const round = Math.exp(-(dx * dx + dy * dy) * inv2s2);
      let dip = 0;
      if (depth > 0 && smudge) {
        const ux = dx - lean * dy;
        const wx = sx * (dy < 0 ? 0.8 + 0.2 * Math.exp(-(dy * dy) / (2 * sy * sy)) : 1);
        const core = Math.exp(-((dx * dx + dy * dy) * inv2s2) / (SMUDGE_CORE * SMUDGE_CORE));
        dip = depth * ((1 - SMUDGE_SHARE) * core + SMUDGE_SHARE * Math.exp(-(ux * ux) / (2 * wx * wx) - (dy * dy) / (2 * sy * sy)));
      } else if (depth > 0) dip = depth * round;
      data[i] = ambientC + base + edge + noise - dip;
      const t = data[i]!; // min and max of the stored float32 values
      if (t < minC) minC = t;
      if (t > maxC) maxC = t;
    }
  }

  const coldSpot = depth > 0 ? { x: centre.x, y: centre.y, radius, depthC: depth } : null;
  return { width: w, height: h, data, ambientC, minC, maxC, coldSpot, coldSpotC: coldSpot ? -depth : null };
}

/** Temperature at a normalised point (nearest sensor pixel). */
export function sampleField(field: ThermalField, x: number, y: number): number {
  const px = clamp(Math.floor(x * field.width), 0, field.width - 1);
  const py = clamp(Math.floor(y * field.height), 0, field.height - 1);
  return field.data[py * field.width + px]!;
}

/** `-4.7 °C` style text for a signed ΔT (Bible section 3: 0.1 °C, ASCII hyphen-minus). */
export function formatDelta(c: number): string {
  const v = round1(c);
  return `${v > 0 ? '+' : ''}${(Object.is(v, -0) ? 0 : v).toFixed(1)} °C`;
}
