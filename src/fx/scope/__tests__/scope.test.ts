import { describe, expect, it } from 'vitest';

import { DIP, DIP_MS, TEAR_MS, TEAR_PX, faultDip, faultTear, sweepTail } from '../scope';

describe('scan scope fault beat', () => {
  it('tears only the first 2 to 3 clock frames, rows offset 4 to 12 px, covering the grid', () => {
    for (let seed = 1; seed < 200; seed++) {
      let torn = 0;
      for (let t = 0; t < 1500; t += 50) {
        const bands = faultTear(seed, t, 240);
        if (!bands) continue;
        torn++;
        expect(bands[0]!.y).toBe(0);
        expect(bands.reduce((s, b) => s + b.h, 0)).toBe(240);
        const moved = bands.filter((b) => b.dx !== 0);
        expect(moved.length).toBeGreaterThan(0);
        for (const b of moved) {
          expect(Math.abs(b.dx)).toBeGreaterThanOrEqual(TEAR_PX[0]);
          expect(Math.abs(b.dx)).toBeLessThanOrEqual(TEAR_PX[1]);
        }
      }
      expect(torn).toBeGreaterThanOrEqual(2);
      expect(torn).toBeLessThanOrEqual(3);
    }
    expect(faultTear(1, TEAR_MS, 240)).toBeNull();
    expect(faultTear(1, -1, 240)).toBeNull();
  });

  it('dips the glass by 30% for 400 ms', () => {
    expect(faultDip(0)).toBe(DIP);
    expect(faultDip(DIP_MS - 1)).toBe(0.3);
    expect(faultDip(DIP_MS)).toBe(0);
    expect(faultDip(-1)).toBe(0);
  });

  it('keeps a continuous tail about a third of the grid', () => {
    expect(sweepTail(300)).toBe(102);
    expect(sweepTail(10)).toBe(16);
  });
});
