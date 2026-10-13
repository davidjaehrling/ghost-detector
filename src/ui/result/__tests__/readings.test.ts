import { describe, expect, it } from 'vitest';
import { TIERS } from '../../../engine';
import { formatReadings, readingsFor } from '../readings';

describe('readingsFor', () => {
  it('is deterministic', () => {
    expect(readingsFor(95, 'active')).toEqual(readingsFor(95, 'active'));
  });
  it('rises with tier and keeps the Bible resolutions', () => {
    for (let seed = 1; seed < 200; seed++) {
      const lows = TIERS.map((t) => readingsFor(seed, t));
      for (const r of lows) {
        expect(r.fluxMg).toBeLessThanOrEqual(2000);
        if (r.fluxMg >= 1000) expect(r.fluxMg % 10).toBe(0);
        expect(Number.isInteger(r.levelDb)).toBe(true);
        expect(Math.round(r.thermalC * 10)).toBeCloseTo(r.thermalC * 10, 6);
      }
      expect(lows[4]!.fluxMg).toBeGreaterThan(lows[0]!.fluxMg);
      expect(lows[4]!.thermalC).toBeLessThan(lows[0]!.thermalC);
    }
  });
  it('formats with units', () => {
    expect(formatReadings({ fluxMg: 1230, thermalC: -4.7, levelDb: -38 })).toEqual({
      flux: '1230 mG',
      thermal: '-4.7 °C',
      level: '-38 dBFS',
    });
  });
});
