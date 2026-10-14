import { describe, expect, it } from 'vitest';
import { DONE, PEAK_FRAME, REST, SCARE, SEGMENTS, maxFlashesIn, nextSegment, scareEligible, scareFrame } from '../scare';

describe('jump-scare flash cadence', () => {
  it('runs 400 to 600 ms', () => {
    expect(SCARE.totalMs).toBeGreaterThanOrEqual(400);
    expect(SCARE.totalMs).toBeLessThanOrEqual(600);
  });

  it('has at most 2 flashes in any second, and every flash ends inside the sequence', () => {
    expect(SCARE.flashAtMs).toEqual([0, 260]);
    expect(maxFlashesIn(SCARE.flashAtMs)).toBeLessThanOrEqual(SCARE.maxPerSecond);
    expect(maxFlashesIn(SCARE.flashAtMs)).toBeLessThanOrEqual(3);
    for (const at of SCARE.flashAtMs) expect(at + SCARE.flashMs).toBeLessThanOrEqual(SCARE.totalMs);
    // Two sequences back to back (the 24 h and per-session caps forbid it) would still be four in 1 s: the check bites.
    expect(maxFlashesIn([0, 260, 500, 760])).toBe(4);
  });

  it('flashes at 0 and 260 ms for 70 ms each, dark in between and after', () => {
    const on = (t: number) => scareFrame(t).flash > 0;
    expect([0, 30, 69].every(on)).toBe(true);
    expect([70, 100, 259].some(on)).toBe(false);
    expect([260, 300, 329].every(on)).toBe(true);
    expect([330, 400, 499].some(on)).toBe(false);
    expect(scareFrame(SCARE.totalMs)).toBe(DONE);
    expect(scareFrame(-5)).toBe(REST);
  });

  it('pops the apparition for one frame at the start of the first flash only', () => {
    expect(scareFrame(0).pop).toBe(true);
    expect(scareFrame(SCARE.popMs - 1).pop).toBe(true);
    expect(scareFrame(SCARE.popMs).pop).toBe(false);
    expect(scareFrame(260).pop).toBe(false);
    // The pop frame is a lighter flash than the rest of the flash, so the figure shows through it.
    expect(scareFrame(0).flash).toBe(SCARE.popFlashOpacity);
    expect(scareFrame(30).flash).toBe(SCARE.flashOpacity);
    expect(SCARE.popFlashOpacity).toBeLessThan(SCARE.flashOpacity);
  });

  it('the golden shows the pop frame', () => {
    expect(PEAK_FRAME).toEqual({ flash: SCARE.popFlashOpacity, pop: true, done: false });
  });

  it('plays every flash and the pop even on a slow display', () => {
    for (const frameMs of [16.7, 50, 120, 300]) {
      const shown: number[] = [];
      let index = 0;
      let painted = 0;
      for (let t = 0, guard = 0; guard < 200; t += frameMs, guard++) {
        const next = nextSegment(index, t, painted);
        if (next !== index) {
          index = next;
          painted = 0;
        }
        if (shown[shown.length - 1] !== index) shown.push(index);
        painted++;
        if (SEGMENTS[index]!.frame.done) break;
      }
      // Every segment was shown, in order, at least once.
      expect(shown).toEqual(SEGMENTS.map((_, i) => i));
    }
    expect(SEGMENTS.filter((s) => s.frame.pop)).toHaveLength(1);
    expect(SEGMENTS.filter((s) => s.frame.flash > 0)).toHaveLength(SCARE.flashAtMs.length + 1); // pop frame + rest of flash 1 + flash 2
    expect(SEGMENTS[SEGMENTS.length - 1]!.frame.done).toBe(true);
  });

  it('on a 60 Hz display follows the clock to within a frame', () => {
    let index = 0;
    let painted = 0;
    let offAt = -1;
    for (let t = 0; t < 700; t += 16.7) {
      const next = nextSegment(index, t, painted);
      if (next !== index) {
        index = next;
        painted = 0;
      }
      painted++;
      if (SEGMENTS[index]!.frame.done && offAt < 0) offAt = t;
    }
    expect(offAt).toBeGreaterThanOrEqual(SCARE.totalMs);
    expect(offAt).toBeLessThan(SCARE.totalMs + 4 * 16.7);
  });

  it('needs the outcome flag, the switch and no reduced motion', () => {
    const base = { jumpScare: true, enabled: true, reduceMotion: false };
    expect(scareEligible(base)).toBe(true);
    expect(scareEligible({ ...base, jumpScare: false })).toBe(false);
    expect(scareEligible({ ...base, enabled: false })).toBe(false);
    expect(scareEligible({ ...base, reduceMotion: true })).toBe(false);
  });
});
