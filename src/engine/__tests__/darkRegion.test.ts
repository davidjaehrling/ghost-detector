import { describe, expect, it } from 'vitest';
import { downsampleLuma, findDarkRegion } from '../darkRegion';
import { mulberry32 } from '../rng';

const W = 64;
const H = 48;

function frame(base: (x: number, y: number) => number, seed = 1, noise = 4) {
  const r = mulberry32(seed);
  const a = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) a[y * W + x] = Math.max(0, Math.min(255, Math.round(base(x, y) + (r() - 0.5) * noise)));
  return a;
}
function fill(a: Uint8Array, x0: number, y0: number, x1: number, y1: number, v: number) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a[y * W + x] = v;
}

const cellar = () => {
  const a = frame((x, y) => 110 + x * 0.3 - y * 0.2);
  fill(a, 46, 32, 64, 48, 14); // dark corner, bottom right
  return a;
};
const brightRoom = () => frame((x) => 190 + x * 0.2);
const pitchBlack = () => frame(() => 2, 3, 3);
const outdoors = () => {
  const a = frame((_x, y) => 170 - y * 0.5);
  fill(a, 0, 0, 64, 7, 25); // tree line along the top edge, bigger and darker
  fill(a, 21, 22, 35, 34, 40); // interior patch
  return a;
};
const attic = () => {
  const a = frame(() => 130);
  fill(a, 6, 8, 22, 26, 18); // large, dark
  fill(a, 40, 30, 50, 38, 45); // small, lighter
  return a;
};

describe('findDarkRegion', () => {
  it('cellar: finds the dark corner', () => {
    const r = findDarkRegion(cellar(), W, H)!;
    expect(r).not.toBeNull();
    expect(r.cx).toBeGreaterThan(0.7);
    expect(r.cy).toBeGreaterThan(0.65);
    expect(r.fallback).toBe(false);
    expect(r.meanLuma).toBeLessThan(30);
  });

  it('bright room: nothing below threshold gives null', () => {
    expect(findDarkRegion(brightRoom(), W, H)).toBeNull();
  });

  it('pitch black: documented fallback window, not touching all edges', () => {
    const r = findDarkRegion(pitchBlack(), W, H)!;
    expect(r).not.toBeNull();
    expect(r.fallback).toBe(true);
    expect(r.x).toBeGreaterThan(0);
    expect(r.x + r.w).toBeLessThan(1);
    expect(r.y).toBeGreaterThan(0);
    expect(r.y + r.h).toBeLessThan(1);
  });

  it('pitch black, perfectly flat zero: same fallback', () => {
    const r = findDarkRegion(new Uint8Array(W * H), W, H)!;
    expect(r.fallback).toBe(true);
    expect(r.x).toBeGreaterThan(0);
  });

  it('outdoors: the edge penalty prefers the interior patch over the top-edge tree line', () => {
    const r = findDarkRegion(outdoors(), W, H)!;
    expect(r.y).toBeGreaterThan(0.3);
    expect(r.cx).toBeGreaterThan(0.3);
    expect(r.cx).toBeLessThan(0.6);
  });

  it('outdoors: without the penalty the tree line wins', () => {
    const r = findDarkRegion(outdoors(), W, H, { edgePenalty: 1 })!;
    expect(r.y).toBe(0);
  });

  it('attic: the larger, darker candidate wins', () => {
    const r = findDarkRegion(attic(), W, H)!;
    expect(r.cx).toBeLessThan(0.4);
    expect(r.cy).toBeLessThan(0.5);
  });

  it('is deterministic', () => {
    for (const f of [cellar, brightRoom, pitchBlack, outdoors, attic]) {
      expect(findDarkRegion(f(), W, H)).toEqual(findDarkRegion(f(), W, H));
    }
  });

  it('returns normalised coordinates', () => {
    const r = findDarkRegion(attic(), W, H)!;
    for (const v of [r.x, r.y, r.w, r.h, r.cx, r.cy, r.areaFraction]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(r.score).toBeGreaterThan(0);
  });
});

describe('downsampleLuma', () => {
  it('box-averages with Rec.709 weights to the target long side', () => {
    const w = 200, h = 100;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = 255; // pure red
      rgba[i * 4 + 3] = 255;
    }
    const d = downsampleLuma(rgba, w, h, 80);
    expect(d.width).toBe(80);
    expect(d.height).toBe(40);
    expect(d.luma.length).toBe(80 * 40);
    expect(d.luma[0]).toBe(Math.round(0.2126 * 255));
  });

  it('does not upscale small frames', () => {
    const d = downsampleLuma(new Uint8ClampedArray(10 * 10 * 4), 10, 10, 64);
    expect(d.width).toBe(10);
  });
});
