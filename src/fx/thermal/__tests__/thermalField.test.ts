import { describe, expect, it } from 'vitest';

import { TIERS, mulberry32, type Tier } from '../../../engine';
import { displayPos, displayRange, encodeField } from '../encode';
import { PH_WHT, hexToRgb, phWht } from '../palette';
import {
  AMBIENT_RANGE,
  NOISE_AMP,
  RADIUS_RANGE,
  TIER_DEPTH,
  buildThermalField,
  coldSpotDepth,
  formatDelta,
  sampleField,
  type LumaGrid,
  type ThermalRegion,
} from '../thermalField';

// A 72 x 96 portrait "room": a lit wall gradient with a dark doorway (the region).
function room(seed: number): { grid: LumaGrid; region: ThermalRegion } {
  const width = 72;
  const height = 96;
  const r = mulberry32(seed);
  const rx = 0.1 + r() * 0.45;
  const ry = 0.15 + r() * 0.45;
  const region = { x: rx, y: ry, w: 0.3, h: 0.35, cx: rx + 0.15, cy: ry + 0.175 };
  const luma = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const v = (y + 0.5) / height;
      const inside = u >= region.x && u <= region.x + region.w && v >= region.y && v <= region.y + region.h;
      luma[y * width + x] = inside ? 18 + Math.floor(r() * 6) : 110 + Math.round(80 * u) + Math.floor(r() * 10);
    }
  }
  return { grid: { luma, width, height }, region };
}

const at = (f: ReturnType<typeof buildThermalField>, x: number, y: number) => f.data[y * f.width + x]!;

describe('buildThermalField', () => {
  it('is deterministic for the same input and differs across seeds', () => {
    const { grid, region } = room(7);
    const a = buildThermalField(grid, region, { seed: 1234, tier: 'strong' });
    const b = buildThermalField(grid, region, { seed: 1234, tier: 'strong' });
    const c = buildThermalField(grid, region, { seed: 1235, tier: 'strong' });
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(a.coldSpot).toEqual(b.coldSpot);
    expect(a.ambientC).toBe(b.ambientC);
    expect(Array.from(a.data)).not.toEqual(Array.from(c.data));
  });

  it('is 120 x 160 for a portrait grid and 160 x 120 for a wide one', () => {
    const p = buildThermalField({ luma: new Uint8Array(72 * 96).fill(80), width: 72, height: 96 }, null, { seed: 1, tier: 'active' });
    const l = buildThermalField({ luma: new Uint8Array(96 * 72).fill(80), width: 96, height: 72 }, null, { seed: 1, tier: 'active' });
    expect([p.width, p.height]).toEqual([120, 160]);
    expect([l.width, l.height]).toEqual([160, 120]);
    expect(p.data.length).toBe(120 * 160);
  });

  it('keeps ambient in 17..23 °C, the noise within ±0.4 °C and min/max honest', { timeout: 30000 }, () => {
    for (let s = 0; s < 200; s++) {
      // Flat luma: the only variation left is the noise.
      const f = buildThermalField({ luma: new Uint8Array(72 * 96).fill(90), width: 72, height: 96 }, null, { seed: s * 7919, tier: 'quiet' });
      expect(f.ambientC).toBeGreaterThanOrEqual(AMBIENT_RANGE[0]);
      expect(f.ambientC).toBeLessThanOrEqual(AMBIENT_RANGE[1]);
      let lo = Infinity;
      let hi = -Infinity;
      let dev = 0;
      for (const t of f.data) {
        dev = Math.max(dev, Math.abs(t - f.ambientC));
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
      }
      expect(dev).toBeLessThanOrEqual(NOISE_AMP + 1e-4);
      expect(f.minC).toBeCloseTo(lo, 5);
      expect(f.maxC).toBeCloseTo(hi, 5);
    }
  });

  it('reads bright as warm', () => {
    const { grid, region } = room(3);
    const f = buildThermalField(grid, region, { seed: 99, tier: 'quiet' });
    // Dark doorway centre vs the lit wall on the far right.
    const door = sampleField(f, region.cx, region.cy);
    const wall = sampleField(f, 0.97, region.cy);
    expect(wall - door).toBeGreaterThan(2);
  });

  it('puts the cold spot inside the dark region, sized 8 to 14% of the short side', { timeout: 30000 }, () => {
    for (let s = 0; s < 300; s++) {
      const { grid, region } = room(s + 11);
      const tier = TIERS[1 + (s % 4)] as Tier;
      const f = buildThermalField(grid, region, { seed: s * 104729 + 3, tier });
      const c = f.coldSpot!;
      expect(c).not.toBeNull();
      expect(c.x).toBeGreaterThanOrEqual(region.x);
      expect(c.x).toBeLessThanOrEqual(region.x + region.w);
      expect(c.y).toBeGreaterThanOrEqual(region.y);
      expect(c.y).toBeLessThanOrEqual(region.y + region.h);
      expect(c.radius).toBeGreaterThanOrEqual(RADIUS_RANGE[0]);
      expect(c.radius).toBeLessThanOrEqual(RADIUS_RANGE[1]);
    }
  });

  it('measures ΔT equal to the tier depth within 0.3 °C (same room with and without the dip)', { timeout: 30000 }, () => {
    for (let s = 0; s < 100; s++) {
      const { grid, region } = room(s + 500);
      const seed = s * 2654435761;
      const without = buildThermalField(grid, region, { seed, tier: 'quiet' });
      for (const tier of ['trace', 'active', 'strong', 'critical'] as const) {
        const f = buildThermalField(grid, region, { seed, tier });
        const c = f.coldSpot!;
        const px = Math.min(f.width - 1, Math.floor(c.x * f.width));
        const py = Math.min(f.height - 1, Math.floor(c.y * f.height));
        const measured = at(f, px, py) - at(without, px, py);
        expect(Math.abs(measured - -TIER_DEPTH[tier])).toBeLessThanOrEqual(0.3);
        expect(f.coldSpotC).toBe(-TIER_DEPTH[tier]);
        // The room outside the dip is the same room.
        expect(f.ambientC).toBe(without.ambientC);
      }
    }
  });

  it('makes the cold spot the coldest point on STRONG and CRITICAL', { timeout: 30000 }, () => {
    for (let s = 0; s < 100; s++) {
      const { grid, region } = room(s + 900);
      for (const tier of ['strong', 'critical'] as const) {
        const f = buildThermalField(grid, region, { seed: s + 1, tier });
        const c = f.coldSpot!;
        expect(sampleField(f, c.x, c.y)).toBeLessThan(f.minC + 0.6);
      }
    }
  });

  it('shapes the cold spot as a figure-height column from STRONG up (D-017, A-46)', { timeout: 30000 }, () => {
    // Second moments of the dip (this field minus the same room on QUIET) around the spot centre.
    const extent = (tier: 'active' | 'strong' | 'critical', seed: number) => {
      const { grid, region } = room(seed + 300);
      const f = buildThermalField(grid, region, { seed, tier });
      const q = buildThermalField(grid, region, { seed, tier: 'quiet' });
      const c = f.coldSpot!;
      const cx = c.x * f.width;
      const cy = c.y * f.height;
      let sw = 0;
      let vx = 0;
      let vy = 0;
      for (let y = 0; y < f.height; y++)
        for (let x = 0; x < f.width; x++) {
          const d = Math.max(0, at(q, x, y) - at(f, x, y));
          sw += d;
          vx += d * (x + 0.5 - cx) ** 2;
          vy += d * (y + 0.5 - cy) ** 2;
        }
      return { w: Math.sqrt(vx / sw), h: Math.sqrt(vy / sw), fh: f.height };
    };
    for (let s = 1; s < 30; s++) {
      for (const tier of ['strong', 'critical'] as const) {
        const e = extent(tier, s);
        // Upright column: clearly taller than wide, its 2-sigma height at least about 30% of the frame.
        expect(e.h / e.w, `${tier} seed ${s}`).toBeGreaterThan(1.6);
        expect((4 * e.h) / e.fh, `${tier} seed ${s}`).toBeGreaterThan(0.3);
      }
      const a = extent('active', s);
      expect(a.h / a.w).toBeLessThan(1.15);
    }
  });

  it('shows the sensor blocks: neighbouring pixels differ (fixed pattern), within the noise budget', () => {
    const f = buildThermalField({ luma: new Uint8Array(72 * 96).fill(90), width: 72, height: 96 }, null, { seed: 5, tier: 'quiet' });
    let diffs = 0;
    for (let i = 1; i < f.data.length; i++) if (Math.abs(f.data[i]! - f.data[i - 1]!) > 0.02) diffs++;
    expect(diffs / f.data.length).toBeGreaterThan(0.8);
  });

  it('puts a warm rim on the lit side of an edge and a cold rim on the dark side', () => {
    const width = 72;
    const height = 96;
    const luma = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) luma[y * width + x] = x < width / 2 ? 40 : 160;
    const f = buildThermalField({ luma, width, height }, null, { seed: 9, tier: 'quiet' });
    const row = Math.floor(f.height / 2);
    const mid = f.width / 2;
    const avg = (x0: number, x1: number) => {
      let s = 0;
      for (let x = x0; x < x1; x++) s += at(f, x, row);
      return s / (x1 - x0);
    };
    // Just right of the edge is warmer than far right; just left is colder than far left.
    expect(avg(mid + 3, mid + 8)).toBeGreaterThan(avg(f.width - 12, f.width - 4) + 0.4);
    expect(avg(mid - 8, mid - 3)).toBeLessThan(avg(4, 12) - 0.4);
  });

  it('draws no cold spot on QUIET, even with a pinned reading', () => {
    const { grid, region } = room(42);
    for (const deltaC of [undefined, -6.4]) {
      const f = buildThermalField(grid, region, { seed: 5, tier: 'quiet', ...(deltaC === undefined ? {} : { deltaC }) });
      expect(f.coldSpot).toBeNull();
      expect(f.coldSpotC).toBeNull();
    }
  });

  it('pins ΔT to a screen reading when given one', () => {
    const { grid, region } = room(8);
    const f = buildThermalField(grid, region, { seed: 77, tier: 'strong', deltaC: -6.43 });
    expect(f.coldSpotC).toBe(-6.4);
    expect(coldSpotDepth('critical', -20)).toBe(12);
    expect(coldSpotDepth('active', 0.5)).toBe(0);
    expect(buildThermalField(grid, region, { seed: 77, tier: 'active', deltaC: 0.5 }).coldSpot).toBeNull();
  });

  it('falls back to the darkest point inside a 15% margin when there is no region', () => {
    const luma = new Uint8Array(72 * 96).fill(200);
    for (let y = 60; y < 70; y++) for (let x = 40; x < 50; x++) luma[y * 72 + x] = 120;
    const f = buildThermalField({ luma, width: 72, height: 96 }, null, { seed: 3, tier: 'critical' });
    expect(f.coldSpot!.x).toBeGreaterThan(40 / 72);
    expect(f.coldSpot!.x).toBeLessThan(50 / 72);
    expect(f.coldSpot!.y).toBeGreaterThan(60 / 96);
    expect(f.coldSpot!.y).toBeLessThan(70 / 96);
  });
});

describe('PH-WHT and encoding', () => {
  it('runs p0 to p5 in six even stops, one hue, monotonic in brightness', () => {
    expect(PH_WHT).toHaveLength(6);
    expect(phWht(0)).toEqual(hexToRgb(PH_WHT[0]!));
    expect(phWht(1)).toEqual(hexToRgb(PH_WHT[5]!));
    expect(phWht(0.4)).toEqual(hexToRgb(PH_WHT[2]!).map((v) => expect.closeTo(v, 6)));
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const [r, g, b] = phWht(i / 100);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      expect(lum).toBeGreaterThan(prev);
      prev = lum;
      // Green-dominant everywhere: the hue never leaves the phosphor.
      expect(g).toBeGreaterThanOrEqual(r);
      expect(g).toBeGreaterThanOrEqual(b);
    }
  });

  it('encodes min to 0 and max to 255, static frame stable, live frames shimmer', () => {
    const { grid, region } = room(1);
    const f = buildThermalField(grid, region, { seed: 9, tier: 'critical' });
    const e = encodeField(f);
    const { lo, hi } = displayRange(f);
    expect(lo).toBe(f.minC);
    expect(hi).toBe(f.maxC);
    let mn = 255;
    let mx = 0;
    for (let i = 0; i < e.length; i += 4) {
      mn = Math.min(mn, e[i]!);
      mx = Math.max(mx, e[i]!);
      expect(e[i + 3]).toBe(255);
    }
    expect([mn, mx]).toEqual([0, 255]);
    expect(Array.from(encodeField(f, 0))).toEqual(Array.from(e));
    expect(Array.from(encodeField(f, 3))).not.toEqual(Array.from(e));
  });

  it('maps temperature to the display scale monotonically, min at 0 and max at 1', () => {
    const { grid, region } = room(2);
    const f = buildThermalField(grid, region, { seed: 4, tier: 'strong' });
    expect(displayPos(f, f.minC)).toBe(0);
    expect(displayPos(f, f.maxC)).toBeCloseTo(1, 9);
    let prev = -1;
    for (let i = 0; i <= 200; i++) {
      const p = displayPos(f, f.minC + ((f.maxC - f.minC) * i) / 200);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it('formats ΔT per the Bible', () => {
    expect(formatDelta(-9)).toBe('-9.0 °C');
    expect(formatDelta(-4.66)).toBe('-4.7 °C');
    expect(formatDelta(1.2)).toBe('+1.2 °C');
    expect(formatDelta(-0.01)).toBe('0.0 °C');
  });
});
