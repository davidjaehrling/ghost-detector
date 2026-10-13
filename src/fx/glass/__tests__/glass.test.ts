import { describe, expect, it } from 'vitest';
import { dustField, SCRATCH_ALPHA } from '../dust';
import { effectiveTau, trailLifetime, trailStyle, warmBrightness } from '../persistence';

describe('dustField (Bible §6 glass layer)', () => {
  it('is fixed per seed and differs across seeds', () => {
    expect(dustField(7)).toEqual(dustField(7));
    expect(dustField(7)).not.toEqual(dustField(8));
  });
  it('stays inside the Bible ranges for many installs', () => {
    for (let seed = 0; seed < 500; seed++) {
      const { specks, scratches } = dustField(seed);
      expect(specks.length).toBeGreaterThanOrEqual(40);
      expect(specks.length).toBeLessThanOrEqual(60);
      expect(scratches.length).toBeGreaterThanOrEqual(2);
      expect(scratches.length).toBeLessThanOrEqual(4);
      for (const s of specks) {
        expect(s.r * 2).toBeGreaterThanOrEqual(1);
        expect(s.r * 2).toBeLessThanOrEqual(3);
        expect(s.alpha).toBeGreaterThanOrEqual(0.02);
        expect(s.alpha).toBeLessThanOrEqual(0.05);
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThan(1);
      }
      for (const s of scratches) {
        expect(s.len).toBeGreaterThanOrEqual(30);
        expect(s.len).toBeLessThanOrEqual(120);
        expect(s.alpha).toBe(SCRATCH_ALPHA);
      }
    }
  });
});

describe('phosphor persistence (Bible §4, §6)', () => {
  it('steps down once per 60 ms for traces from p4 to p0, then fades', () => {
    expect(trailStyle(4, 0, 180)).toEqual({ step: 4, opacity: 1 });
    expect(trailStyle(4, 59, 180)?.step).toBe(4);
    expect(trailStyle(4, 60, 180)?.step).toBe(3);
    expect(trailStyle(4, 239, 180)?.step).toBe(1);
    expect(trailStyle(4, 240, 180)).toEqual({ step: 0, opacity: 1 });
    const fading = trailStyle(4, 300 + 90, 180)!;
    expect(fading.step).toBe(0);
    expect(fading.opacity).toBeCloseTo(0.5, 5);
    expect(trailStyle(4, trailLifetime(4, 180), 180)).toBeNull();
  });
  it('uses 150 ms steps for the sweep (tau 450)', () => {
    expect(trailStyle(4, 149, 450)?.step).toBe(4);
    expect(trailStyle(4, 150, 450)?.step).toBe(3);
    expect(trailLifetime(4, 450)).toBe(1200);
  });
  it('never lets a bright element decay faster than a dim one', () => {
    for (let age = 0; age < 1500; age += 5) {
      const bright = trailStyle(5, age, 180);
      const dim = trailStyle(2, age, 180);
      const v = (s: ReturnType<typeof trailStyle>) => (s ? s.step + s.opacity : -1);
      expect(v(bright)).toBeGreaterThanOrEqual(v(dim));
    }
  });
  it('caps tau at 60 ms under reduced motion', () => {
    expect(effectiveTau(450, true)).toBe(60);
    expect(effectiveTau(450, false)).toBe(450);
  });
});

describe('warm-up brightness', () => {
  it('ramps 0 to 1 monotonically', () => {
    expect(warmBrightness(0)).toBe(0);
    expect(warmBrightness(1)).toBe(1);
    let last = -1;
    for (let t = 0; t <= 1; t += 0.05) {
      expect(warmBrightness(t)).toBeGreaterThanOrEqual(last);
      last = warmBrightness(t);
    }
  });
});
