import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../rng';

const draw = (seed: number, n: number) => {
  const r = mulberry32(seed);
  return Array.from({ length: n }, () => r());
};

describe('mulberry32', () => {
  it('is deterministic for the same seed', () => {
    expect(draw(42, 100)).toEqual(draw(42, 100));
  });

  it('gives different streams for different seeds', () => {
    expect(draw(1, 20)).not.toEqual(draw(2, 20));
  });

  it('stays within [0,1) with a mean near 0.5', () => {
    const xs = draw(7, 10000);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});
