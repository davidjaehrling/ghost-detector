/**
 * Silhouette metrics on a low-resolution alpha grid, computed without Skia. The grid runs the
 * same steps as `renderApparition`: the union of the `shape.ts` polygons minus the cut, noise
 * displacement, Gaussian feather, then the noise alpha mask (edge erosion and a density floor).
 * The noise here is a seeded value noise standing in for Skia's FractalNoise (same frequency and
 * amplitude, different pattern), so the metrics hold for the geometry, not for one noise draw.
 */
import { APPARITION_ASPECT, buildSilhouette, coverageAt, type Silhouette } from './shape';

/** Noise frequency in cycles per box width, shared with the Skia path (`render.ts`). */
export const NOISE_CYCLES = 4.5;
/** Alpha at or above this counts as part of the silhouette. */
export const SILHOUETTE_ALPHA = 0.25;
/** Grid width in cells; the height is twice that (the box is 1:2). */
export const GRID_W = 40;

/** How much of its density the figure keeps at the very bottom: the drape fades out (no feet). */
export const HEM_FADE = 0.4;
/** The fade starts this far down the box (0..1). */
export const HEM_FADE_FROM = 0.62;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Noise alpha mask: erode the soft edge by `erode * n`, keep the core, vary density down to
 * `floor`, and fade the lower body toward `HEM_FADE` (v is 0..1 down the box).
 */
export function maskAlpha(a: number, nEdge: number, nDensity: number, erode: number, floor: number, v = 0): number {
  const t = erode * nEdge;
  const e = Math.min(1, Math.max(0, (a - t) / (1 - t)));
  const fade = 1 - (1 - HEM_FADE) * smoothstep(HEM_FADE_FROM, 1, v);
  return e * (floor + (1 - floor) * nDensity) * fade;
}

function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Two-octave value noise, 0..1, for x and y in box widths. */
export function fbm(x: number, y: number, seed: number): number {
  return (valueNoise(x, y, seed) + 0.5 * valueNoise(2 * x + 17.3, 2 * y + 5.1, seed + 1)) / 1.5;
}

function blur1d(src: Float32Array, w: number, h: number, sigma: number, horizontal: boolean): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k: number[] = [];
  let ks = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k.push(v);
    ks += v;
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        const xx = horizontal ? x + i : x;
        const yy = horizontal ? y : y + i;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; // decal: zero outside
        s += src[yy * w + xx]! * k[i + r]!;
      }
      out[y * w + x] = s / ks;
    }
  return out;
}

export interface AlphaGrid {
  w: number;
  h: number;
  alpha: Float32Array;
}

/** Alpha 0..1 per cell for a silhouette, `gw` x `2 * gw` cells. */
export function alphaGrid(sil: Silhouette, gw = GRID_W): AlphaGrid {
  const gh = Math.round(gw / APPARITION_ASPECT);
  const cov = new Float32Array(gw * gh);
  const sub = 3;
  const dSeed = sil.seed * 7 + 11;
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      let s = 0;
      for (let sy = 0; sy < sub; sy++)
        for (let sx = 0; sx < sub; sx++) {
          const u = (gx + (sx + 0.5) / sub) / gw;
          const v = (gy + (sy + 0.5) / sub) / gh;
          // Displacement: offset by (n - 0.5) * scale per axis, in box widths.
          const nx = fbm(u * NOISE_CYCLES, v * NOISE_CYCLES * 2, dSeed);
          const ny = fbm(u * NOISE_CYCLES + 31.7, v * NOISE_CYCLES * 2 + 3.3, dSeed);
          const du = (nx - 0.5) * sil.displace;
          const dv = (ny - 0.5) * sil.displace * APPARITION_ASPECT;
          s += coverageAt(sil, u + du, v + dv);
        }
      cov[gy * gw + gx] = s / (sub * sub);
    }
  const sigma = Math.max(0.5, sil.feather * gw);
  const blurred = blur1d(blur1d(cov, gw, gh, sigma, true), gw, gh, sigma, false);
  const alpha = new Float32Array(gw * gh);
  const mSeed = sil.seed * 13 + 5;
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      const u = (gx + 0.5) / gw;
      const v = (gy + 0.5) / gh;
      const nEdge = fbm(u * NOISE_CYCLES, v * NOISE_CYCLES * 2, mSeed);
      const nDen = fbm(u * NOISE_CYCLES * 0.7 + 9.1, v * NOISE_CYCLES * 1.4 + 2.7, mSeed + 3);
      alpha[gy * gw + gx] = maskAlpha(blurred[gy * gw + gx]!, nEdge, nDen, sil.erode, sil.densityFloor, v);
    }
  return { w: gw, h: gh, alpha };
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Bounding box of the silhouette cells (inclusive), or null when empty. */
export function silhouetteBox(g: AlphaGrid, thr = SILHOUETTE_ALPHA): Box | null {
  let x0 = g.w;
  let y0 = g.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++)
      if (g.alpha[y * g.w + x]! >= thr) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Silhouette cells / cells of its bounding box. */
export function areaFraction(g: AlphaGrid, thr = SILHOUETTE_ALPHA): number {
  const b = silhouetteBox(g, thr);
  if (!b) return 0;
  let n = 0;
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (g.alpha[y * g.w + x]! >= thr) n++;
  return n / ((b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1));
}

/**
 * Pearson correlation between the alpha and its left-right mirror about the silhouette box's
 * vertical centre line, over the box. 1 is perfectly symmetric.
 */
export function mirrorCorrelation(g: AlphaGrid, thr = SILHOUETTE_ALPHA): number {
  const b = silhouetteBox(g, thr);
  if (!b) return 0;
  const a: number[] = [];
  const m: number[] = [];
  for (let y = b.y0; y <= b.y1; y++)
    for (let x = b.x0; x <= b.x1; x++) {
      a.push(g.alpha[y * g.w + x]!);
      m.push(g.alpha[y * g.w + (b.x0 + b.x1 - x)]!);
    }
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  let sab = 0;
  let saa = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i]! - ma) * (m[i]! - ma);
    saa += (a[i]! - ma) ** 2;
  }
  return saa > 0 ? sab / saa : 1;
}

/**
 * Largest enclosed hole (background cells not 4-connected to the grid border) as a fraction of
 * the silhouette's cell count. 0 when the silhouette has no holes.
 */
export function largestHoleFraction(g: AlphaGrid, thr = SILHOUETTE_ALPHA): number {
  const { w, h, alpha } = g;
  const fg = (i: number) => alpha[i]! >= thr;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!seen[i] && !fg(i)) {
      seen[i] = 1;
      stack.push(i);
    }
  };
  const flood = () => {
    let n = 0;
    while (stack.length) {
      const i = stack.pop()!;
      n++;
      const x = i % w;
      const y = (i - x) / w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w);
      if (y < h - 1) push(i + w);
    }
    return n;
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  flood();
  let silCells = 0;
  for (let i = 0; i < w * h; i++) if (fg(i)) silCells++;
  let largest = 0;
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || fg(i)) continue;
    push(i);
    largest = Math.max(largest, flood());
  }
  return silCells ? largest / silCells : 0;
}

export interface SilhouetteMetrics {
  mirror: number;
  hole: number;
  area: number;
}

export function silhouetteMetrics(variant: number, seed: number, gw = GRID_W): SilhouetteMetrics {
  const g = alphaGrid(buildSilhouette(variant, seed), gw);
  return { mirror: mirrorCorrelation(g), hole: largestHoleFraction(g), area: areaFraction(g) };
}
