import { describe, expect, it } from 'vitest';

import { largestHoleFraction, mirrorCorrelation, silhouetteMetrics } from '../metrics';
import { buildSilhouette, coverageAt, OCCLUDED_VARIANTS, VARIANT_COUNT } from '../shape';

const SEEDS = Array.from({ length: 20 }, (_, i) => 1 + i * 7919);

describe('apparition silhouettes (6 variants x 20 seeds)', () => {
  for (let v = 0; v < VARIANT_COUNT; v++) {
    it(`variant ${v}: asymmetric, no enclosed hole over 1%, area 25 to 60% of its box`, { timeout: 30000 }, () => {
      for (const seed of SEEDS) {
        const m = silhouetteMetrics(v, seed);
        expect(m.mirror, `mirror v${v} s${seed}`).toBeLessThan(0.85);
        expect(m.hole, `hole v${v} s${seed}`).toBeLessThanOrEqual(0.01);
        expect(m.area, `area v${v} s${seed}`).toBeGreaterThanOrEqual(0.25);
        expect(m.area, `area v${v} s${seed}`).toBeLessThanOrEqual(0.6);
      }
    });
  }

  it('is deterministic per seed and varies across seeds', () => {
    const a = buildSilhouette(1, 42);
    const b = buildSilhouette(1, 42);
    const c = buildSilhouette(1, 43);
    expect(b).toEqual(a);
    expect(c.parts[0]!.poly).not.toEqual(a.parts[0]!.poly);
  });

  it('carries a ragged occluder on exactly two variants', () => {
    for (let v = 0; v < VARIANT_COUNT; v++) {
      const sil = buildSilhouette(v, 5);
      expect(sil.cut !== null, `variant ${v}`).toBe(OCCLUDED_VARIANTS.includes(v));
    }
    expect(OCCLUDED_VARIANTS).toHaveLength(2);
  });

  it('the occluder hides 3 to 30% of the body', () => {
    // Over a domain larger than the box: the fit uses the visible extents, so the hidden part
    // may fall outside the image.
    for (const v of OCCLUDED_VARIANTS) {
      for (const seed of [1, 9, 23, 40]) {
        const sil = buildSilhouette(v, seed);
        let whole = 0;
        let kept = 0;
        for (let y = -0.2; y < 1.8; y += 0.01)
          for (let x = -0.5; x < 1.5; x += 0.01) {
            whole += coverageAt({ ...sil, cut: null }, x, y);
            kept += coverageAt(sil, x, y);
          }
        const hidden = 1 - kept / whole;
        expect(hidden, `variant ${v} seed ${seed}`).toBeGreaterThan(0.03);
        expect(hidden, `variant ${v} seed ${seed}`).toBeLessThan(0.3);
      }
    }
  });
});

describe('metric functions', () => {
  const grid = (w: number, h: number, f: (x: number, y: number) => number) => {
    const alpha = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) alpha[y * w + x] = f(x, y);
    return { w, h, alpha };
  };

  it('a symmetric ellipse scores mirror correlation near 1', () => {
    const g = grid(20, 40, (x, y) => (((x - 9.5) / 6) ** 2 + ((y - 19.5) / 15) ** 2 <= 1 ? 1 : 0));
    expect(mirrorCorrelation(g)).toBeGreaterThan(0.98);
  });

  it('finds an enclosed hole and ignores a notch open to the outside', () => {
    const ring = grid(20, 20, (x, y) => (x >= 4 && x <= 15 && y >= 4 && y <= 15 && !(x >= 8 && x <= 11 && y >= 8 && y <= 11) ? 1 : 0));
    expect(largestHoleFraction(ring)).toBeCloseTo(16 / (144 - 16), 5);
    const notch = grid(20, 20, (x, y) => (x >= 4 && x <= 15 && y >= 4 && y <= 15 && !(x >= 8 && x <= 11 && y >= 4 && y <= 11) ? 1 : 0));
    expect(largestHoleFraction(notch)).toBe(0);
  });
});
