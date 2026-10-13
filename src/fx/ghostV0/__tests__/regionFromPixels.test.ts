import { Buffer } from 'node:buffer';
import { encode } from 'jpeg-js';
import { describe, expect, it } from 'vitest';

import { base64ToBytes, REGION_GRID, regionFromJpegBase64, regionFromRgba } from '../regionFromPixels';

// A 96 x 128 portrait frame (the size expo-image-manipulator hands back): mid-grey wall with a
// dark patch lower left, the kind of frame the native path sees after the resize.
const W = 96;
const H = 128;
const PATCH = { x0: 10, y0: 70, x1: 46, y1: 118 };

function scene(): Uint8Array {
  const px = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const inPatch = x >= PATCH.x0 && x < PATCH.x1 && y >= PATCH.y0 && y < PATCH.y1;
      const v = inPatch ? 18 + ((x + y) % 5) : 150 + ((x * 7 + y * 3) % 20);
      px[i] = v;
      px[i + 1] = v;
      px[i + 2] = v;
      px[i + 3] = 255;
    }
  }
  return px;
}

function jpegBase64(px: Uint8Array, w: number, h: number): string {
  return Buffer.from(encode({ data: px, width: w, height: h }, 90).data).toString('base64');
}

describe('base64ToBytes', () => {
  it('matches Node for standard, url-safe, data-URI and unpadded input', () => {
    const bytes = Uint8Array.from({ length: 1000 }, (_, i) => (i * 37 + 11) & 0xff);
    for (const len of [0, 1, 2, 3, 998, 1000]) {
      const src = bytes.subarray(0, len);
      const b64 = Buffer.from(src).toString('base64');
      expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(src));
      expect(Array.from(base64ToBytes(b64.replace(/=+$/, '')))).toEqual(Array.from(src));
      expect(Array.from(base64ToBytes(Buffer.from(src).toString('base64url')))).toEqual(Array.from(src));
      expect(Array.from(base64ToBytes(`data:image/jpeg;base64,${b64}`))).toEqual(Array.from(src));
    }
  });
});

describe('regionFromJpegBase64 (native decode path)', () => {
  it('finds the dark patch in a JPEG and agrees with the raw-pixel path', () => {
    const px = scene();
    const fromJpeg = regionFromJpegBase64(jpegBase64(px, W, H));
    const fromRaw = regionFromRgba(px, W, H);
    expect(fromJpeg).not.toBeNull();
    const r = fromJpeg!.region!;
    expect(r).not.toBeNull();
    expect(r.fallback).toBe(false);
    // Centroid inside the patch, box close to it (JPEG ringing allowed a couple of px).
    expect(r.cx * W).toBeGreaterThan(PATCH.x0);
    expect(r.cx * W).toBeLessThan(PATCH.x1);
    expect(r.cy * H).toBeGreaterThan(PATCH.y0);
    expect(r.cy * H).toBeLessThan(PATCH.y1);
    expect(Math.abs(r.x * W - PATCH.x0)).toBeLessThanOrEqual(3);
    expect(Math.abs((r.x + r.w) * W - PATCH.x1)).toBeLessThanOrEqual(3);
    expect(Math.abs(r.y * H - PATCH.y0)).toBeLessThanOrEqual(3);
    expect(Math.abs((r.y + r.h) * H - PATCH.y1)).toBeLessThanOrEqual(3);
    expect(fromJpeg!.meanLuma).toBeGreaterThan(12);
    expect(fromJpeg!.meanLuma).toBeLessThan(30);
    expect(fromJpeg!.p90Luma).toBeGreaterThanOrEqual(fromJpeg!.meanLuma);
    expect(Math.abs(fromJpeg!.meanLuma - fromRaw.meanLuma)).toBeLessThan(4);
    expect(Math.abs(r.cx - fromRaw.region!.cx)).toBeLessThan(0.03);
    expect(Math.abs(r.cy - fromRaw.region!.cy)).toBeLessThan(0.03);
  });

  it('downsamples a larger JPEG to the 96 px grid first', () => {
    // Same scene at 2x: the result must match the 1x region in normalised coordinates.
    const small = scene();
    const big = new Uint8Array(W * 2 * H * 2 * 4);
    for (let y = 0; y < H * 2; y++) {
      for (let x = 0; x < W * 2; x++) {
        const s = ((y >> 1) * W + (x >> 1)) * 4;
        big.set(small.subarray(s, s + 4), (y * W * 2 + x) * 4);
      }
    }
    const a = regionFromJpegBase64(jpegBase64(big, W * 2, H * 2))!.region!;
    const b = regionFromRgba(small, W, H).region!;
    expect(REGION_GRID).toBe(96);
    expect(Math.abs(a.cx - b.cx)).toBeLessThan(0.03);
    expect(Math.abs(a.cy - b.cy)).toBeLessThan(0.03);
  });

  it('returns a null region with the frame mean for a bright frame, and null for junk', () => {
    const px = new Uint8Array(W * H * 4).fill(230);
    const res = regionFromJpegBase64(jpegBase64(px, W, H))!;
    expect(res.region).toBeNull();
    expect(res.meanLuma).toBeGreaterThan(220);
    expect(res.p90Luma).toBeGreaterThan(220);
    expect(regionFromJpegBase64('bm90IGEganBlZw==')).toBeNull();
  });
});
