import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../engine';
import {
  CENTRE_EXCLUSION,
  MAX_AREA_FRACTION,
  OPACITY_MAX,
  OPACITY_MIN,
  PEAK_LIFT,
  ghostTint,
  placeGhost,
  type Placement,
  type RegionInput,
} from '../placement';

const FRAMES = [
  { w: 1080, h: 1920 },
  { w: 1920, h: 1080 },
  { w: 390, h: 844 },
  { w: 512, h: 512 },
];

function union(p: Placement) {
  const dx = p.offsetCopies.map((c) => c.dx);
  const dy = p.offsetCopies.map((c) => c.dy);
  const x0 = p.x + Math.min(0, ...dx);
  const x1 = p.x + p.w + Math.max(0, ...dx);
  const y0 = p.y + Math.min(0, ...dy);
  const y1 = p.y + p.h + Math.max(0, ...dy);
  return { x0, x1, y0, y1, area: (x1 - x0) * (y1 - y0) };
}

function randomRegion(rnd: () => number): RegionInput {
  const w = 0.1 + rnd() * 0.6;
  const h = 0.1 + rnd() * 0.6;
  const x = rnd() * (1 - w);
  const y = rnd() * (1 - h);
  return { x, y, w, h, cx: x + w * (0.3 + rnd() * 0.4), cy: y + h * (0.3 + rnd() * 0.4), areaFraction: w * h * 0.7 };
}

// 4 frames x 500 seeds, half of them with a null region.
const CASES: { frame: (typeof FRAMES)[number]; region: RegionInput | null; seed: number }[] = [];
{
  const rnd = mulberry32(42);
  for (const frame of FRAMES) {
    for (let s = 0; s < 500; s++) {
      CASES.push({ frame, region: s % 2 ? randomRegion(rnd) : null, seed: (rnd() * 2 ** 32) >>> 0 });
    }
  }
}

describe('placeGhost', () => {
  it('keeps the figure and its copies at or under 15% of the frame', () => {
    for (const { frame, region, seed } of CASES) {
      const p = placeGhost(region, frame, seed);
      expect(union(p).area / (frame.w * frame.h)).toBeLessThanOrEqual(MAX_AREA_FRACTION);
    }
  });

  it('keeps the figure and its copies inside the frame', () => {
    for (const { frame, region, seed } of CASES) {
      const u = union(placeGhost(region, frame, seed));
      expect(u.x0).toBeGreaterThanOrEqual(-1e-6);
      expect(u.y0).toBeGreaterThanOrEqual(-1e-6);
      expect(u.x1).toBeLessThanOrEqual(frame.w + 1e-6);
      expect(u.y1).toBeLessThanOrEqual(frame.h + 1e-6);
    }
  });

  it('never centres the figure in the frame', () => {
    for (const { frame, region, seed } of CASES) {
      const p = placeGhost(region, frame, seed);
      expect(Math.abs(p.x + p.w / 2 - frame.w / 2)).toBeGreaterThanOrEqual(CENTRE_EXCLUSION * frame.w);
    }
  });

  it('even for a region dead centre in the frame', () => {
    const region = { x: 0.3, y: 0.3, w: 0.4, h: 0.4, cx: 0.5, cy: 0.5, areaFraction: 0.16 };
    for (let seed = 0; seed < 200; seed++) {
      const p = placeGhost(region, { w: 1080, h: 1920 }, seed);
      expect(Math.abs(p.x + p.w / 2 - 540)).toBeGreaterThanOrEqual(CENTRE_EXCLUSION * 1080);
    }
  });

  it('sits inside the region, off its centroid', () => {
    const frame = { w: 1080, h: 1920 };
    const region = { x: 0.05, y: 0.4, w: 0.35, h: 0.45, cx: 0.22, cy: 0.62, areaFraction: 0.12 };
    for (let seed = 0; seed < 200; seed++) {
      const p = placeGhost(region, frame, seed);
      const fx = (p.x + p.w / 2) / frame.w;
      const fy = (p.y + p.h / 2) / frame.h;
      expect(fx).toBeGreaterThanOrEqual(region.x - 1e-9);
      expect(fx).toBeLessThanOrEqual(region.x + region.w + 1e-9);
      expect(fy).toBeGreaterThanOrEqual(region.y - 1e-9);
      expect(fy).toBeLessThanOrEqual(region.y + region.h + 1e-9);
      // Offset is 10 to 30% of the region size on each axis.
      const ox = Math.abs(fx - region.cx) / region.w;
      const oy = Math.abs(fy - region.cy) / region.h;
      expect(ox).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(ox).toBeLessThanOrEqual(0.3 + 1e-9);
      expect(oy).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(oy).toBeLessThanOrEqual(0.3 + 1e-9);
    }
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const region = CASES[1]!.region;
    const a = placeGhost(region, FRAMES[0]!, 1234);
    expect(placeGhost(region, FRAMES[0]!, 1234)).toEqual(a);
    const distinct = new Set<string>();
    for (let s = 0; s < 30; s++) distinct.add(JSON.stringify(placeGhost(region, FRAMES[0]!, s)));
    expect(distinct.size).toBe(30);
  });

  it('falls back to an off-centre lower-third placement with no region', () => {
    const left = { n: 0 };
    for (let seed = 0; seed < 300; seed++) {
      for (const frame of FRAMES) {
        const p = placeGhost(null, frame, seed);
        expect(p.y + p.h).toBeGreaterThanOrEqual((frame.h * 2) / 3);
        expect(p.y + p.h / 2).toBeGreaterThan(frame.h / 2);
        if (p.x + p.w / 2 < frame.w / 2) left.n++;
      }
    }
    // Both sides get used.
    expect(left.n).toBeGreaterThan(300);
    expect(left.n).toBeLessThan(900);
  });

  it('keeps opacity in band, uses all three mattes, 3 to 5 copies at falling alpha', () => {
    const mattes = new Set<number>();
    for (const { frame, region, seed } of CASES) {
      const p = placeGhost(region, frame, seed);
      mattes.add(p.matte);
      expect(p.opacity).toBeGreaterThanOrEqual(OPACITY_MIN);
      expect(p.opacity).toBeLessThanOrEqual(OPACITY_MAX);
      expect(p.offsetCopies.length).toBeGreaterThanOrEqual(3);
      expect(p.offsetCopies.length).toBeLessThanOrEqual(5);
      for (let i = 1; i < p.offsetCopies.length; i++) {
        expect(p.offsetCopies[i]!.alpha).toBeLessThan(p.offsetCopies[i - 1]!.alpha);
      }
    }
    expect([...mattes].sort()).toEqual([1, 2, 3]);
  });

  it('honours a narrower opacity band and clamps a wider one', () => {
    for (let seed = 0; seed < 100; seed++) {
      const p = placeGhost(null, FRAMES[0]!, seed, { opacityRange: [0.11, 0.18] });
      expect(p.opacity).toBeGreaterThanOrEqual(0.11);
      expect(p.opacity).toBeLessThanOrEqual(0.18);
      const q = placeGhost(null, FRAMES[0]!, seed, { opacityRange: [0, 0.9] });
      expect(q.opacity).toBeGreaterThanOrEqual(OPACITY_MIN);
      expect(q.opacity).toBeLessThanOrEqual(OPACITY_MAX);
    }
  });
});

describe('ghostTint', () => {
  it('is neutral grey, at or above the region mean, and lifts the peak by about PEAK_LIFT', () => {
    for (const { frame, region, seed } of CASES.slice(0, 200)) {
      const p = placeGhost(region, frame, seed);
      for (const mean of [0, 12, 40, 90, 200]) {
        const t = ghostTint(mean, p);
        expect(t.hex).toMatch(/^#([0-9a-f]{2})\1\1$/);
        expect(t.luma).toBeGreaterThanOrEqual(mean);
        let keep = 1 - p.opacity;
        for (const c of p.offsetCopies) keep *= 1 - p.opacity * c.alpha;
        const peak = mean + (t.luma - mean) * (1 - keep);
        expect(peak).toBeLessThanOrEqual(mean + PEAK_LIFT + 1);
        if (t.luma < 255) expect(peak).toBeGreaterThanOrEqual(mean + PEAK_LIFT - 1);
      }
    }
  });
});
