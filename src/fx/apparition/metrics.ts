/**
 * Silhouette metrics on a low-resolution alpha grid, computed without Skia. The grid runs the
 * same steps as `renderApparition`: the union of the `shape.ts` polygons minus the cut, noise
 * displacement, Gaussian feather, then the noise alpha mask (edge erosion and a density floor).
 * The noise here is a seeded value noise standing in for Skia's FractalNoise (same frequency and
 * amplitude, different pattern), so the metrics hold for the geometry, not for one noise draw.
 */
import { APPARITION_ASPECT, buildSilhouette, coverageAt, HEM_RAG, NO_FADE, type Fade, type Silhouette } from './shape';

export { HEM_RAG };

/** Noise frequency in cycles per box width, shared with the Skia path (`render.ts`). */
export const NOISE_CYCLES = 4.5;
/** Alpha at or above this counts as part of the silhouette. */
export const SILHOUETTE_ALPHA = 0.25;
/** Grid width in cells; the height is twice that (the box is 1:2). */
export const GRID_W = 40;

/**
 * Interior density (D-017): a low-frequency noise field (DENSITY_CYCLES per box width down the
 * body, DENSITY_CYCLES_X across it) maps to
 * DENSITY_FLOOR..1 through a smoothstep over DENSITY_EDGES of the noise, so the body reads as
 * thicker and thinner patches of light, never an even wash.
 */
export const DENSITY_CYCLES = 1.6;
/** Across the body the patches are finer, so a patch never spans the body as a mirrored band. */
export const DENSITY_CYCLES_X = 1.6;
export const DENSITY_FLOOR = 0.4;
export const DENSITY_EDGES: readonly [number, number] = [0.15, 0.45];
/**
 * Ragged edge (D-022). After the first feather, the soft edge is displaced by a high-frequency
 * noise (RAG_CYCLES per box width) by RAG_DISPLACE box widths peak to peak (0.06 box widths either
 * way: 2 to 6 px at the drawn sizes), then eroded where a noise at the same frequency, stretched
 * RAG_STRETCH down the body (streaks), is high (RAG_ERODE over RAG_EDGES of the noise), so the
 * outline breaks into teeth and notches. A second, fine feather (FEATHER2 box widths) softens the
 * cut without rounding it off. The seeded tendrils in `shape.ts` break it at the larger scale that
 * the ghost layer's blur, motion copies and smear keep.
 */
export const RAG_CYCLES = 24;
export const RAG_STRETCH = 0.35;
export const RAG_DISPLACE = 0.12;
export const RAG_ERODE = 0.8;
export const RAG_EDGES: readonly [number, number] = [0.4, 0.6];
export const RAG_CORE: readonly [number, number] = [0.45, 0.85];
export const FEATHER2 = 0.008;
/**
 * The hem dissolve's fade line moves up and down by up to HEM_RAG box heights (peak to peak,
 * `shape.ts`) with a noise of HEM_RAG_CYCLES per box width across (stretched down the body), so
 * the body ends in ragged wisps, never a straight fade.
 */
/** Noise sample (about 0.5 +- 0.2) to a signed offset in -1..1, as the SkSL does. */
export const ragOffset = (n: number) => Math.min(1, Math.max(-1, (n - 0.5) * 2.5));
export const HEM_RAG_CYCLES = 9;

/** Feathered coverage over which the interior modulation fades in (the edge keeps full density). */
export const INTERIOR: readonly [number, number] = [0.45, 0.8];
/** The lateral density ramp runs across this part of the box width. */
export const LATERAL_EDGES: readonly [number, number] = [0.3, 0.8];

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Density 0..1 for a low-frequency noise sample (about 0.5 +- 0.25). */
export function densityAt(n: number, floor = DENSITY_FLOOR): number {
  return floor + (1 - floor) * smoothstep(DENSITY_EDGES[0], DENSITY_EDGES[1], n);
}

/**
 * Noise alpha mask: erode the soft edge by `erode * n` plus the ragged erosion (`rag.n`), keep the
 * core, vary density (the fine `nDensity` term down to `floor`, the coarse `nLow` term down to
 * DENSITY_FLOOR), and fade the lower body (v is 0..1 down the box; the fade line is moved by
 * `rag.hem`, a noise sample about 0.5).
 */
export function maskAlpha(
  a: number,
  nEdge: number,
  nDensity: number,
  erode: number,
  floor: number,
  v = 0,
  nLow = 1,
  fade: Fade = NO_FADE,
  lat: { u: number; amount: number; side: 1 | -1 } = { u: 0.5, amount: 0, side: 1 },
  rag: { n: number; hem: number } = { n: 0, hem: 0.5 },
): number {
  // The ragged erosion bites into the soft edge only (where the feathered coverage is under
  // RAG_CORE), so it opens notches in the outline, never holes in the body.
  const bite = smoothstep(RAG_EDGES[0], RAG_EDGES[1], rag.n) * (1 - smoothstep(RAG_CORE[0], RAG_CORE[1], a));
  const t = Math.min(0.95, erode * nEdge + RAG_ERODE * bite);
  const e = Math.min(1, Math.max(0, (a - t) / (1 - t)));
  const vf = v + HEM_RAG * 0.5 * ragOffset(rag.hem);
  const f = 1 - (1 - fade.floor) * smoothstep(fade.from, fade.to, vf);
  // The coarse patches and the lateral ramp work on the interior only: where the feathered
  // coverage is high. Thin parts and the edge keep their density, so the outline (and its
  // asymmetry) survives.
  // It also eases out through the hem fade, so the thinning drape never encloses a dark patch.
  const inner = smoothstep(INTERIOR[0], INTERIOR[1], a) * (1 - smoothstep(fade.from, (fade.from + fade.to) / 2, vf));
  const mod = Math.max(DENSITY_FLOOR, densityAt(nLow) * lateralAt(lat.u, lat.amount, lat.side));
  return e * (floor + (1 - floor) * nDensity) * (1 - inner + inner * mod) * f;
}

/** Density factor across the box: 1 on one side, 1 - amount toward `side` (u 0..1 across). */
export function lateralAt(u: number, amount: number, side: 1 | -1): number {
  return 1 - amount * smoothstep(LATERAL_EDGES[0], LATERAL_EDGES[1], side > 0 ? u : 1 - u);
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
  // Bilinear sample of the feathered coverage at a normalised point (zero outside).
  const sample = (u: number, v: number) => {
    const x = u * gw - 0.5;
    const y = v * gh - 0.5;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const at = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= gw || yy >= gh ? 0 : blurred[yy * gw + xx]!);
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  };
  const masked = new Float32Array(gw * gh);
  const mSeed = sil.seed * 13 + 5;
  const rSeed = sil.seed * 19 + 7;
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      const u = (gx + 0.5) / gw;
      const v = (gy + 0.5) / gh;
      const ru = u * RAG_CYCLES;
      const rv = v * RAG_CYCLES * 2 * RAG_STRETCH;
      const hu = u * RAG_CYCLES;
      const hv = v * RAG_CYCLES * 2;
      const du = ragOffset(fbm(hu, hv, rSeed)) * RAG_DISPLACE * 0.5;
      const dv = ragOffset(fbm(hu + 13.1, hv + 7.7, rSeed)) * RAG_DISPLACE * 0.5 * APPARITION_ASPECT;
      const a = sample(u + du, v + dv);
      const nEdge = fbm(u * NOISE_CYCLES, v * NOISE_CYCLES * 2, mSeed);
      const nDen = fbm(u * NOISE_CYCLES * 0.7 + 9.1, v * NOISE_CYCLES * 1.4 + 2.7, mSeed + 3);
      const nLow = fbm(u * DENSITY_CYCLES_X + 4.3, v * DENSITY_CYCLES * 2 + 1.9, mSeed + 7);
      const nRag = fbm(ru + 29.3, rv + 3.9, rSeed + 1);
      const nHem = fbm(u * HEM_RAG_CYCLES + 5.5, v * HEM_RAG_CYCLES * 2 * RAG_STRETCH + 8.2, rSeed + 2);
      masked[gy * gw + gx] = maskAlpha(a, nEdge, nDen, sil.erode, sil.densityFloor, v, nLow, sil.fade, { u, amount: sil.lateral, side: sil.lateralSide }, { n: nRag, hem: nHem });
    }
  // Second feather: fine, so the ragged cut stays ragged.
  const s2 = Math.max(0.3, FEATHER2 * gw);
  return { w: gw, h: gh, alpha: blur1d(blur1d(masked, gw, gh, s2, true), gw, gh, s2, false) };
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
  /** Outline length / convex hull perimeter (`edgeIrregularity`). */
  edge: number;
}

export function silhouetteMetrics(variant: number, seed: number, gw = GRID_W): SilhouetteMetrics {
  const g = alphaGrid(buildSilhouette(variant, seed), gw);
  return { mirror: mirrorCorrelation(g), hole: largestHoleFraction(g), area: areaFraction(g), edge: edgeIrregularity(g) };
}

/**
 * Edge irregularity (D-022): length of the silhouette's outline over the perimeter of its convex
 * hull. The outline is the marching-squares contour at `thr` (edge crossings interpolated, the grid
 * padded with empty cells), so a smooth convex blob scores about 1.0 and a cell staircase does not
 * inflate it; every contour counts (tendrils, notches, small islands). Ragged edges score higher.
 */
export function edgeIrregularity(g: AlphaGrid, thr = SILHOUETTE_ALPHA): number {
  const { w, h, alpha } = g;
  // Padded grid: cell (x, y) of the padded grid is (x - 1, y - 1) of the alpha grid.
  const at = (x: number, y: number) => (x < 1 || y < 1 || x > w || y > h ? 0 : alpha[(y - 1) * w + (x - 1)]!);
  const pts: [number, number][] = [];
  let length = 0;
  const cross = (x0: number, y0: number, a0: number, x1: number, y1: number, a1: number): [number, number] => {
    const t = (thr - a0) / (a1 - a0);
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  };
  for (let y = 0; y <= h; y++)
    for (let x = 0; x <= w; x++) {
      // Corners of the square between sample centres (x, y) .. (x + 1, y + 1).
      const a = at(x, y);
      const b = at(x + 1, y);
      const c = at(x + 1, y + 1);
      const d = at(x, y + 1);
      const e: [number, number][] = [];
      if (a >= thr !== b >= thr) e.push(cross(x, y, a, x + 1, y, b));
      if (b >= thr !== c >= thr) e.push(cross(x + 1, y, b, x + 1, y + 1, c));
      if (c >= thr !== d >= thr) e.push(cross(x + 1, y + 1, c, x, y + 1, d));
      if (d >= thr !== a >= thr) e.push(cross(x, y + 1, d, x, y, a));
      // Two crossings: one segment; four (a saddle): two segments, paired in order.
      for (let i = 0; i + 1 < e.length; i += 2) {
        length += Math.hypot(e[i + 1]![0] - e[i]![0], e[i + 1]![1] - e[i]![1]);
        pts.push(e[i]!, e[i + 1]!);
      }
    }
  const hull = convexHullPerimeter(pts);
  return hull > 0 ? length / hull : 0;
}

/** Perimeter of the convex hull of a point set (monotone chain). */
export function convexHullPerimeter(points: readonly (readonly [number, number])[]): number {
  if (points.length < 2) return 0;
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const crossZ = (o: readonly number[], a: readonly number[], b: readonly number[]) => (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!);
  const half = (list: readonly (readonly [number, number])[]) => {
    const out: (readonly [number, number])[] = [];
    for (const q of list) {
      while (out.length >= 2 && crossZ(out[out.length - 2]!, out[out.length - 1]!, q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  const hull = [...half(p), ...half(p.slice().reverse())];
  let s = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    s += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return s;
}
