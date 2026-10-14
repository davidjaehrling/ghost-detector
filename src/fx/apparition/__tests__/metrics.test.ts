import { describe, expect, it } from 'vitest';

import { alphaGrid, DENSITY_FLOOR, densityAt, edgeIrregularity, HEM_RAG, largestHoleFraction, maskAlpha, mirrorCorrelation, silhouetteMetrics } from '../metrics';
import { buildSilhouette, coverageAt, HEM_DISSOLVE, OCCLUDED_VARIANTS, VARIANT_COUNT } from '../shape';

const SEEDS = Array.from({ length: 20 }, (_, i) => 1 + i * 7919);

describe('apparition silhouettes (6 variants x 20 seeds)', () => {
  for (let v = 0; v < VARIANT_COUNT; v++) {
    it(`variant ${v}: asymmetric (mirror <= 0.55), no enclosed hole over 1%, area 30 to 60% of its box, ragged edge (outline >= 1.25 x hull)`, { timeout: 30000 }, () => {
      for (const seed of SEEDS) {
        const m = silhouetteMetrics(v, seed);
        expect(m.edge, `edge v${v} s${seed}`).toBeGreaterThanOrEqual(1.25);
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

  it('the occluder hides 2 to 40% of the visible body (above the end of the hem dissolve)', () => {
    // Over a domain larger than the box: the fit uses the visible extents, so the hidden part
    // may fall outside the image.
    for (const v of OCCLUDED_VARIANTS) {
      for (const seed of [1, 9, 23, 40]) {
        const sil = buildSilhouette(v, seed);
        let whole = 0;
        let kept = 0;
        for (let y = -0.2; y < sil.fade.to; y += 0.01)
          for (let x = -0.5; x < 1.5; x += 0.01) {
            whole += coverageAt({ ...sil, cut: null }, x, y);
            kept += coverageAt(sil, x, y);
          }
        const hidden = 1 - kept / whole;
        expect(hidden, `variant ${v} seed ${seed}`).toBeGreaterThan(0.02);
        expect(hidden, `variant ${v} seed ${seed}`).toBeLessThan(0.4);
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
    // On the rendered grids: the densest cells are well above the thinnest ones. Twice in round 2;
    // 1.8 since the ragged erosion (D-022) cuts the soft low-alpha rim that part of that spread
    // came from (the interior band itself is pinned by the formula checks above).
    for (let v = 0; v < VARIANT_COUNT; v++) {
      const g = alphaGrid(buildSilhouette(v, 17));
      const inner = Array.from(g.alpha).filter((a, i) => a > 0.2 && i / g.w / g.h < 0.55).sort((a, b) => a - b);
      expect(inner[Math.floor(inner.length * 0.95)]! / inner[Math.floor(inner.length * 0.05)]!, `variant ${v}`).toBeGreaterThan(1.8);
    }
  });

  it('dissolves every variant between 50 and 70% of its height and leaves no tail below (D-022)', { timeout: 60000 }, () => {
    expect(HEM_DISSOLVE).toEqual([0.5, 0.7]);
    for (let v = 0; v < VARIANT_COUNT; v++)
      for (const seed of SEEDS) {
        const sil = buildSilhouette(v, seed);
        expect(sil.fade.floor).toBe(0);
        // The fade starts and ends 50 to 70% of the way down the whole body (head top to hem; the
        // polygons run on below the box, faded out).
        let y0 = Infinity;
        let y1 = -Infinity;
        for (const p of sil.parts)
          for (const [, y] of p.poly) {
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
        const from = (sil.fade.from - y0) / (y1 - y0);
        const to = (sil.fade.to - y0) / (y1 - y0);
        expect(from, `v${v} s${seed}`).toBeGreaterThanOrEqual(0.5 - 1e-9);
        expect(to, `v${v} s${seed}`).toBeLessThanOrEqual(0.7 + 1e-9);
        // Below the fade (its end, plus the ragged line's reach and one cell of the fine feather)
        // the alpha is exactly 0: no drape, no flare, no tail on any variant.
        // (The hood's cut can end the body above its fade; then the fade lies under the box.)
        const g = alphaGrid(sil);
        const below = Math.min(g.h - 2, Math.ceil((sil.fade.to + HEM_RAG / 2) * g.h) + 1);
        for (let y = below; y < g.h; y++) for (let x = 0; x < g.w; x++) expect(g.alpha[y * g.w + x], `v${v} s${seed} row ${y}`).toBe(0);
      }
  });

  it('the hem line is ragged: the lowest visible cell varies across the figure', () => {
    for (let v = 0; v < VARIANT_COUNT; v++) {
      const g = alphaGrid(buildSilhouette(v, 7));
      const lows: number[] = [];
      for (let x = 0; x < g.w; x++) {
        let low = -1;
        for (let y = 0; y < g.h; y++) if (g.alpha[y * g.w + x]! >= 0.25) low = y;
        if (low >= 0) lows.push(low);
      }
      const steps = lows.slice(1).filter((l, i) => l !== lows[i]).length;
      expect(steps, `variant ${v}`).toBeGreaterThan(lows.length / 3);
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

  it('edge irregularity: about 1 for a smooth blob, higher for a ragged one', () => {
    const blob = grid(40, 80, (x, y) => (((x - 19.5) / 12) ** 2 + ((y - 39.5) / 30) ** 2 <= 1 ? 1 : 0));
    expect(edgeIrregularity(blob)).toBeLessThan(1.1);
    const ragged = grid(40, 80, (x, y) => {
      const r = 1 + 0.25 * Math.sin(Math.atan2(y - 39.5, x - 19.5) * 15);
      return ((x - 19.5) / 12) ** 2 + ((y - 39.5) / 30) ** 2 <= r * r ? 1 : 0;
    });
    expect(edgeIrregularity(ragged)).toBeGreaterThan(1.25);
  });

  it('finds an enclosed hole and ignores a notch open to the outside', () => {
    const ring = grid(20, 20, (x, y) => (x >= 4 && x <= 15 && y >= 4 && y <= 15 && !(x >= 8 && x <= 11 && y >= 8 && y <= 11) ? 1 : 0));
    expect(largestHoleFraction(ring)).toBeCloseTo(16 / (144 - 16), 5);
    const notch = grid(20, 20, (x, y) => (x >= 4 && x <= 15 && y >= 4 && y <= 15 && !(x >= 8 && x <= 11 && y >= 4 && y <= 11) ? 1 : 0));
    expect(largestHoleFraction(notch)).toBe(0);
  });
});
