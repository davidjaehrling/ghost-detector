import { describe, expect, it } from 'vitest';
import { trailLifetime } from '../../../fx/glass/persistence';
import { fx } from '../../tokens';
import { SWEEP_FAST_MS, SWEEP_SLOW_MS, SWEEP_STATIC_DEG, advanceSweep, sweepPeriodMs, sweepPoint, sweepStep } from '../sweep';

describe('radar sweep', () => {
  it('turns slowest at the GEO centre and speeds up with the deviation, within bounds', () => {
    expect(sweepPeriodMs(400)).toBe(SWEEP_SLOW_MS);
    let last = sweepPeriodMs(400);
    for (const mg of [500, 600, 800, 1000]) {
      const p = sweepPeriodMs(mg);
      expect(p).toBeLessThan(last);
      last = p;
    }
    expect(sweepPeriodMs(2000)).toBe(SWEEP_FAST_MS);
    for (let mg = 10; mg <= 2000; mg += 10) {
      expect(sweepPeriodMs(mg)).toBeGreaterThanOrEqual(SWEEP_FAST_MS);
      expect(sweepPeriodMs(mg)).toBeLessThanOrEqual(SWEEP_SLOW_MS);
    }
    // Below the centre counts the same as above it.
    expect(sweepPeriodMs(300)).toBe(sweepPeriodMs(500));
  });

  it('is brighter on the upper rungs of the ladder', () => {
    expect(sweepStep(400)).toBe(3);
    expect(sweepStep(500)).toBe(3);
    expect(sweepStep(560)).toBe(4);
    expect(sweepStep(1500)).toBe(4);
  });

  it('advances one turn per period and wraps', () => {
    let deg = 0;
    for (let i = 0; i < 26; i++) deg = advanceSweep(deg, 100, SWEEP_SLOW_MS);
    expect(deg).toBeCloseTo(((26 * 100 * 360) / SWEEP_SLOW_MS) % 360, 6);
    expect(advanceSweep(359, 100, 3600)).toBeCloseTo(9, 6);
    // A stalled frame advances by at most 100 ms.
    expect(advanceSweep(0, 5000, 3600)).toBeCloseTo(10, 6);
    expect(advanceSweep(10, -50, 3600)).toBe(10);
  });

  it('keeps a visible tail of about 1.2 s at tau 450 ms, a fraction of a turn at every speed', () => {
    expect(fx.tauSweep).toBe(450);
    expect(trailLifetime(4, fx.tauSweep)).toBe(1200);
    // The tail spans 83 degrees at the slow period and 240 at the fast one: never a full circle.
    for (const p of [SWEEP_SLOW_MS, SWEEP_FAST_MS]) expect((1200 / p) * 360).toBeLessThan(360);
  });

  it('places points clockwise from straight up', () => {
    expect(sweepPoint(100, 100, 50, 0)).toEqual({ x: 100, y: 50 });
    const r = sweepPoint(100, 100, 50, 90);
    expect(r.x).toBeCloseTo(150, 9);
    expect(r.y).toBeCloseTo(100, 9);
    expect(SWEEP_STATIC_DEG).toBe(52);
  });
});
