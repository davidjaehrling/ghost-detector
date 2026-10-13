/**
 * Platform-free half of `regionFromImage`: pixels in, `RegionResult` out. Web feeds it canvas
 * RGBA; native feeds it a small JPEG (from expo-image-manipulator) decoded by jpeg-js.
 */
import { decode } from 'jpeg-js';

import { downsampleLuma, findDarkRegion, type DarkRegion } from '../../engine';

export interface RegionResult {
  /** Darkest usable region, or null when the frame is too bright for one. */
  region: DarkRegion | null;
  /** Mean luma 0..255 of the region, or of the whole frame when `region` is null. */
  meanLuma: number;
  /**
   * 90th-percentile luma 0..255 inside the region's box (whole frame when `region` is null).
   * Only the tint fallback of `GhostV0` uses it (`regionP90Luma`).
   */
  p90Luma: number;
}

/** Long side of the luma grid handed to `findDarkRegion` (digest section 5: 64 to 96 px). */
export const REGION_GRID = 96;

function percentile(values: Uint8Array, p: number): number {
  if (values.length === 0) return 0;
  const sorted = Uint8Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

/** Downsample to the 96 px luma grid, find the dark region, and summarise its brightness. */
export function regionFromRgba(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number): RegionResult {
  const data = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length);
  const { luma, width, height } = downsampleLuma(data, w, h, REGION_GRID);
  const region = findDarkRegion(luma, width, height);
  if (!region) {
    let sum = 0;
    for (let i = 0; i < luma.length; i++) sum += luma[i]!;
    return { region: null, meanLuma: sum / Math.max(1, luma.length), p90Luma: percentile(luma, 0.9) };
  }
  const x0 = Math.floor(region.x * width);
  const y0 = Math.floor(region.y * height);
  const x1 = Math.min(width, Math.max(x0 + 1, Math.round((region.x + region.w) * width)));
  const y1 = Math.min(height, Math.max(y0 + 1, Math.round((region.y + region.h) * height)));
  const box = new Uint8Array((x1 - x0) * (y1 - y0));
  let k = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) box[k++] = luma[y * width + x]!;
  return { region, meanLuma: region.meanLuma, p90Luma: percentile(box, 0.9) };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  t['-'.charCodeAt(0)] = 62; // base64url
  t['_'.charCodeAt(0)] = 63;
  return t;
})();

/** Standard or url-safe base64 to bytes. Ignores whitespace, padding and a `data:` prefix. */
export function base64ToBytes(b64: string): Uint8Array {
  const body = b64.startsWith('data:') ? b64.slice(b64.indexOf(',') + 1) : b64;
  const out = new Uint8Array(Math.floor((body.length * 3) / 4));
  let n = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body.charCodeAt(i);
    const v = c < 128 ? B64_INDEX[c]! : -1;
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, n);
}

/** Decode a base64 JPEG and run the region finder. Null when the bytes do not decode. */
export function regionFromJpegBase64(b64: string): RegionResult | null {
  try {
    const img = decode(base64ToBytes(b64), { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 4 });
    if (!img.width || !img.height) return null;
    return regionFromRgba(img.data, img.width, img.height);
  } catch {
    return null;
  }
}
