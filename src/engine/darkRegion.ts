/**
 * Dark-region finder (digest section 5). Pure and deterministic: no randomness.
 * Caller supplies a greyscale frame, 64 to 96 px on the long side.
 */

export interface DarkRegion {
  /** Bounding box, normalised 0..1. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Centroid of the region's pixels, normalised 0..1. */
  cx: number;
  cy: number;
  score: number;
  /** Mean luma of the region, 0..255. */
  meanLuma: number;
  /** Region pixels / frame pixels. */
  areaFraction: number;
  /** True when no usable component existed and the darkest window was used. */
  fallback: boolean;
}

export interface DarkRegionOptions {
  /** Percentile used for the threshold. Default 0.2. */
  percentile?: number;
  /** Threshold is capped at this fraction of the median luma. Default 0.6. */
  medianCap?: number;
  /** Threshold is never above this luma, so a bright frame yields null. Default 110. */
  absoluteCap?: number;
  /** Components smaller than this fraction of the frame are ignored. Default 0.015. */
  minAreaFraction?: number;
  /** Score multiplier per frame edge a component touches. Default 0.6. */
  edgePenalty?: number;
  /** Frames with a median luma at or below this are treated as pitch black. Default 24. */
  blackMedian?: number;
  /** Components whose bounding box is thinner than this fraction of the frame's short side are rejected. Default 0.06. */
  minThickness?: number;
  /** Components whose bounding box is longer than this multiple of its thickness are rejected. Default 4. */
  maxAspect?: number;
}

/** Variance (of luma in 0..1) is scaled by this before 1 / (1 + v). */
const VARIANCE_SCALE = 400;

/** Box-average RGBA down so the long side is `target` px. Returns luma plus size. */
export function downsampleLuma(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  target: number,
): { luma: Uint8Array; width: number; height: number } {
  const scale = Math.min(1, target / Math.max(w, h));
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  const luma = new Uint8Array(width * height);
  for (let ty = 0; ty < height; ty++) {
    const y0 = Math.floor((ty * h) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * h) / height));
    for (let tx = 0; tx < width; tx++) {
      const x0 = Math.floor((tx * w) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * w) / width));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          sum += 0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!;
          n++;
        }
      }
      luma[ty * width + tx] = Math.round(sum / n);
    }
  }
  return { luma, width, height };
}

function integralImage(luma: ArrayLike<number>, w: number, h: number): Float64Array {
  const stride = w + 1;
  const ii = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += luma[y * w + x]!;
      ii[(y + 1) * stride + x + 1] = ii[y * stride + x + 1]! + row;
    }
  }
  return ii;
}

function boxSum(ii: Float64Array, w: number, x0: number, y0: number, x1: number, y1: number) {
  const s = w + 1;
  return ii[y1 * s + x1]! - ii[y0 * s + x1]! - ii[y1 * s + x0]! + ii[y0 * s + x0]!;
}

/**
 * Fallback for frames with no usable component (pitch black): the darkest
 * window of 30% x 30% inside a 10% margin, found with the integral image.
 * Ties go to the window nearest the frame centre, then scan order.
 */
function fallbackRegion(luma: ArrayLike<number>, w: number, h: number): DarkRegion {
  const ii = integralImage(luma, w, h);
  const ww = Math.max(1, Math.round(w * 0.3));
  const wh = Math.max(1, Math.round(h * 0.3));
  const mx = Math.floor(w * 0.1);
  const my = Math.floor(h * 0.1);
  let best = { x: mx, y: my, mean: Infinity, d: Infinity };
  for (let y = my; y + wh <= h - my; y++) {
    for (let x = mx; x + ww <= w - mx; x++) {
      const mean = boxSum(ii, w, x, y, x + ww, y + wh) / (ww * wh);
      const d = Math.hypot(x + ww / 2 - w / 2, y + wh / 2 - h / 2);
      if (mean < best.mean - 1e-9 || (Math.abs(mean - best.mean) <= 1e-9 && d < best.d)) {
        best = { x, y, mean, d };
      }
    }
  }
  return {
    x: best.x / w,
    y: best.y / h,
    w: ww / w,
    h: wh / h,
    cx: (best.x + ww / 2) / w,
    cy: (best.y + wh / 2) / h,
    score: 0,
    meanLuma: best.mean,
    areaFraction: (ww * wh) / (w * h),
    fallback: true,
  };
}

export function findDarkRegion(
  luma: Uint8Array | number[],
  width: number,
  height: number,
  opts: DarkRegionOptions = {},
): DarkRegion | null {
  const {
    percentile = 0.2,
    medianCap = 0.6,
    absoluteCap = 110,
    minAreaFraction = 0.015,
    edgePenalty = 0.6,
    blackMedian = 24,
    minThickness = 0.06,
    maxAspect = 4,
  } = opts;
  const n = width * height;
  if (n === 0 || luma.length < n) return null;

  const sorted = Float64Array.from(Array.prototype.slice.call(luma, 0, n) as number[]).sort();
  const at = (p: number) => sorted[Math.min(n - 1, Math.floor(p * n))]!;
  const median = at(0.5);
  const thr = Math.min(at(percentile), median * medianCap, absoluteCap);

  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = luma[i]! <= thr && luma[i]! < 255 ? 1 : 0;

  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  let best: DarkRegion | null = null;
  let bestTouches4 = false;

  for (let start = 0; start < n; start++) {
    if (!mask[start] || seen[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let area = 0, sum = 0, sumSq = 0, sx = 0, sy = 0;
    let minX = width, maxX = -1, minY = height, maxY = -1;
    while (sp > 0) {
      const i = stack[--sp]!;
      const x = i % width;
      const y = (i - x) / width;
      const v = luma[i]!;
      area++; sum += v; sumSq += v * v; sx += x; sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < width - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
      if (y > 0 && mask[i - width] && !seen[i - width]) { seen[i - width] = 1; stack[sp++] = i - width; }
      if (y < height - 1 && mask[i + width] && !seen[i + width]) { seen[i + width] = 1; stack[sp++] = i + width; }
    }
    const areaFraction = area / n;
    if (areaFraction < minAreaFraction) continue;

    // Edge slivers and thin lines are not rooms. Skipped; if nothing else qualifies we fall through.
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const thick = Math.min(bw, bh);
    if (thick < minThickness * Math.min(width, height) || Math.max(bw, bh) / thick > maxAspect) continue;

    const mean = sum / area;
    const variance = Math.max(0, sumSq / area - mean * mean) / (255 * 255);
    const darkness = 1 - mean / 255;
    const touches = [minX === 0, maxX === width - 1, minY === 0, maxY === height - 1];
    const touchCount = touches.filter(Boolean).length;
    const score =
      areaFraction * darkness * (1 / (1 + variance * VARIANCE_SCALE)) * Math.pow(edgePenalty, touchCount);

    if (!best || score > best.score + 1e-12) {
      best = {
        x: minX / width,
        y: minY / height,
        w: (maxX - minX + 1) / width,
        h: (maxY - minY + 1) / height,
        cx: (sx / area + 0.5) / width,
        cy: (sy / area + 0.5) / height,
        score,
        meanLuma: mean,
        areaFraction,
        fallback: false,
      };
      bestTouches4 = touchCount === 4;
    }
  }

  // A pitch-black frame is one component wrapping every edge, or only speckle.
  if ((!best || bestTouches4) && median <= blackMedian) return fallbackRegion(luma, width, height);
  return best;
}
