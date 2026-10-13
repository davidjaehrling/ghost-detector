import { describe, expect, it } from 'vitest';

import { alphaGrid, DENSITY_FLOOR, densityAt, largestHoleFraction, maskAlpha, mirrorCorrelation, silhouetteMetrics } from '../metrics';
import { buildSilhouette, coverageAt, HEM, LEAN_DISSOLVE, OCCLUDED_VARIANTS, TRAIL_HEM, VARIANT_COUNT } from '../shape';

const SEEDS = Array.from({ length: 20 }, (_, i) => 1 + i * 7919);

describe('apparition silhouettes (6 variants x 20 seeds)', () => {
  for (let v = 0; v < VARIANT_COUNT; v++) {
    it(`variant ${v}: asymmetric (mirror <= 0.55), no enclosed hole over 1%, area 30 to 60% of its box`, { timeout: 30000 }, () => {
      for (const seed of SEEDS) {
        const m = silhouetteMetrics(v, seed);
        expect(m.mirror, `mirror v${v} s${seed}`).toBeLessThanOrEqual(0.55);
        expect(m.hole, `hole v${v} s${seed}`).toBeLessThanOrEqual(0.01);
        expect(m.area, `area v${v} s${seed}`).toBeGreaterThanOrEqual(0.3);
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

describe('believability (D-017)', () => {
  it('modulates the interior density between 40 and 100% with low-frequency noise', () => {
    expect(densityAt(0)).toBeCloseTo(DENSITY_FLOOR, 9);
    expect(DENSITY_FLOOR).toBe(0.4);
    expect(densityAt(1)).toBe(1);
    // Deep inside the body (full coverage, above the hem) the coarse term spans the band; the edge keeps full density.
    const core = (n: number) => maskAlpha(1, 0, 1, 0.3, 1, 0.3, n);
    expect(core(0) / core(1)).toBeCloseTo(0.4, 2);
    const edge = (n: number) => maskAlpha(0.4, 0, 1, 0.3, 1, 0.3, n);
    expect(edge(0)).toBeCloseTo(edge(1), 9);
    // On the rendered grids: the densest interior cells are at least twice the thinnest ones.
    for (let v = 0; v < VARIANT_COUNT; v++) {
      const g = alphaGrid(buildSilhouette(v, 17));
      const inner = Array.from(g.alpha).filter((a, i) => a > 0.2 && i / g.w / g.h < 0.55).sort((a, b) => a - b);
      expect(inner[Math.floor(inner.length * 0.95)]! / inner[Math.floor(inner.length * 0.05)]!, `variant ${v}`).toBeGreaterThan(2);
    }
  });

  it('dissolves the lean variant at 55 to 65% of its height and leaves no tail below', () => {
    for (const seed of SEEDS) {
      const sil = buildSilhouette(0, seed);
      expect(sil.fade.floor).toBe(0);
      const g = alphaGrid(sil);
      // Below the end of the fade nothing is left.
      const below = Math.ceil(sil.fade.to * g.h) + 1;
      for (let y = below; y < g.h; y++) for (let x = 0; x < g.w; x++) expect(g.alpha[y * g.w + x]).toBe(0);
      // The fade's centre sits 55 to 65% of the way down the whole body (head top to hem; the
      // polygons run on below the box, faded out).
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const p of sil.parts)
        for (const [, y] of p.poly) {
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      const frac = ((sil.fade.from + sil.fade.to) / 2 - y0) / (y1 - y0);
      expect(frac, `seed ${seed}`).toBeGreaterThanOrEqual(0.53);
      expect(frac, `seed ${seed}`).toBeLessThanOrEqual(0.67);
      expect(LEAN_DISSOLVE).toEqual([0.55, 0.65]);
    }
    // Other variants keep a hem fade (the trail variant a deeper one).
    for (let v = 1; v < VARIANT_COUNT; v++) expect(buildSilhouette(v, 3).fade).toEqual(v === 5 ? TRAIL_HEM : HEM);
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
