import { describe, expect, it } from 'vitest';

import { DIP, DIP_MS, TEAR_MS, TEAR_PX, faultDip, faultTear, holdScopeFrame, scopeTime, sweepTail, type ScopeFrame } from '../scope';

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

describe('scan scope time source under still', () => {
  const frameAt = (ms: number): ScopeFrame => ({ tick: Math.floor(ms / 100), sweep: (ms / 2400) % 1, activeFrac: Math.min(1, ms / 20000), faultT: ms > 9000 && ms < 10500 ? ms - 9000 : -1 });

  it('still: returns the first frame for every later clock step, whatever the clock does', () => {
    const first = frameAt(1500);
    let held = holdScopeFrame(null, first, true);
    for (let ms = 1500; ms <= 25000; ms += 50) {
      held = holdScopeFrame(held, frameAt(ms), true);
      expect(scopeTime(frameAt(ms), held, true)).toBe(first);
    }
    expect(held).toEqual({ tick: 15, sweep: 0.625, activeFrac: 0.075, faultT: -1 });
  });

  it('not still: the live frame passes through unchanged and nothing is held', () => {
    for (let ms = 0; ms <= 25000; ms += 50) {
      const live = frameAt(ms);
      expect(holdScopeFrame(frameAt(0), live, false)).toBeNull();
      expect(scopeTime(live, null, false)).toBe(live);
    }
  });

  it('still again after live: holds the frame current at that moment', () => {
    let held = holdScopeFrame(null, frameAt(100), true);
    held = holdScopeFrame(held, frameAt(5000), false);
    held = holdScopeFrame(held, frameAt(7000), true);
    expect(scopeTime(frameAt(8000), held, true)).toEqual(frameAt(7000));
  });
});
