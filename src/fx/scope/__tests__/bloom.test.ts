import { describe, expect, it } from 'vitest';

import { PHOSPHOR, withAlpha } from '../../glass/color';
import { bootSpike, HARNESS_SPIKE, sweepBloomStops, SWEEP_FADE_PX, tailAlpha, tailStep } from '../bloom';

describe('sweep head bloom and tail (A-32)', () => {
  it('has a p5 head, then p3, p2, p1, fading exponentially to nothing within the fade length', () => {
    expect(tailStep(0)).toBe(5);
    expect(tailStep(5)).toBe(3);
    expect(tailStep(25)).toBe(2);
    expect(tailStep(45)).toBe(1);
    expect(tailAlpha(0)).toBe(1);
    expect(tailAlpha(SWEEP_FADE_PX)).toBeCloseTo(Math.exp(-3), 9);
    expect(tailAlpha(SWEEP_FADE_PX + 1)).toBe(0);
    let last = 2;
    for (let d = 0; d <= SWEEP_FADE_PX; d++) {
      expect(tailAlpha(d)).toBeLessThan(last);
      last = tailAlpha(d);
    }
  });

  it('gives gradient stops with the head at the leading edge and no fill past the tail', () => {
    // A 90 degree wedge of radius 120 px: 188 px of arc, the tail ends at 60 px.
    const { positions, colors } = sweepBloomStops(90, 120);
    expect(positions.length).toBe(colors.length);
    expect(positions.at(-1)).toBe(1);
    expect(colors.at(-1)).toBe(withAlpha(PHOSPHOR[5], 1));
    for (let i = 1; i < positions.length; i++) expect(positions[i]!).toBeGreaterThan(positions[i - 1]!);
    // Everything older than the fade length is transparent: the wedge has no flat fill.
    const arc = (90 * Math.PI * 120) / 180;
    positions.forEach((p, i) => {
      if ((1 - p) * arc >= SWEEP_FADE_PX - 1e-9) expect(colors[i]).toMatch(/, 0\)$/);
    });
    // The 1 px head: the stop 1 px behind the leading edge is already p3, not p5.
    expect(colors.at(-2)).toBe(withAlpha(PHOSPHOR[5], tailAlpha(1)));
    expect(colors.at(-3)!.startsWith(withAlpha(PHOSPHOR[3], 0).slice(0, -3))).toBe(true);
  });
});

describe('boot transient per launch (A-11)', () => {
  it('varies 1.2 to 2.5 divisions at 40 to 80% of the sweep, about one boot in four without a spike', () => {
    let skipped = 0;
    const N = 10000;
    const divs: number[] = [];
    const ats: number[] = [];
    for (let s = 1; s <= N; s++) {
      const b = bootSpike(s * 7919);
      if (!b.fires) skipped++;
      expect(b.count).toBe(b.fires ? 1 : 0);
      expect(b.div).toBeGreaterThanOrEqual(1.2);
      expect(b.div).toBeLessThanOrEqual(2.5);
      expect(b.at).toBeGreaterThanOrEqual(0.4);
      expect(b.at).toBeLessThanOrEqual(0.8);
      divs.push(b.div);
      ats.push(b.at);
    }
    expect(skipped / N).toBeGreaterThan(0.22);
    expect(skipped / N).toBeLessThan(0.28);
    // It really varies: the spread covers most of each range.
    expect(Math.max(...divs) - Math.min(...divs)).toBeGreaterThan(1.2);
    expect(Math.max(...ats) - Math.min(...ats)).toBeGreaterThan(0.38);
    // Same launch seed, same spike.
    expect(bootSpike(42)).toEqual(bootSpike(42));
  });

  it('is frozen under the harness', () => {
    for (const s of [1, 2, 3, 99]) expect(bootSpike(s, true)).toEqual(HARNESS_SPIKE);
    expect(HARNESS_SPIKE).toEqual({ fires: true, count: 1, div: 2, at: 0.6 });
  });
});
