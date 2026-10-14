import { describe, expect, it } from 'vitest';

import { alphaGrid, edgeIrregularity, SILHOUETTE_ALPHA } from '../../apparition/metrics';
import { buildSilhouette, FIT_W, VARIANT_COUNT } from '../../apparition/shape';
import { placeGhost } from '../../ghostV0/placement';
import { CLAMP_LIFT, plusClamped, POP_ALPHA, POP_GAMMA, POP_LIFT } from '../blend';
import { POP_SMEAR_PX, popFrameGrid, popSmearFor } from '../motion';

// Pinned values: the pop frame's look (D-023) and the clamp the measurement script checks.
describe('compositor constants', () => {
  it('caps the pop frame at a 30% effective alpha (D-023)', () => {
    expect(POP_ALPHA).toBe(0.3);
    expect(POP_GAMMA).toBe(1);
  });

  it('opens the clamp by 40 luma on the pop frame', () => {
    expect(POP_LIFT).toBe(40);
  });

  it('keeps the steady clamp at 34 luma above the reference', () => {
    expect(CLAMP_LIFT).toBe(34);
  });
});

describe('pop frame (D-023)', () => {
  const SEEDS = [3, 11, 29, 47, 101];

  it('no pixel gets more than POP_ALPHA of white, whatever the backdrop', () => {
    for (const bg of [0, 0.04, 0.3, 0.8]) {
      for (const t of [0.05, 0.3, 0.7, 1]) {
        const a = POP_ALPHA * t;
        const out = plusClamped([bg, bg, bg], a, 1, POP_ALPHA, { gamma: POP_GAMMA });
        // Plus with white at the layer alpha: never more than POP_ALPHA of light added.
        expect(out[0] - bg).toBeLessThanOrEqual(POP_ALPHA + 1e-9);
        // Linear curve: the lift is in proportion to the layer alpha, so the hem's faint alpha
        // passes unflattened (round 3's t^0.35 at a 2.4x gain turned it into a hard edge).
        expect(out[0] - bg).toBeCloseTo(Math.min(POP_ALPHA, 1 - bg) * t, 9);
      }
    }
  });

  it('smears 6 to 10 px along the figure motion, weights summing to 1', () => {
    for (const seed of SEEDS) {
      const p = placeGhost(null, { w: 318, h: 303 }, seed, { tier: 'critical' });
      const s = popSmearFor(seed, p);
      expect(s.length).toBeGreaterThanOrEqual(POP_SMEAR_PX[0]);
      expect(s.length).toBeLessThanOrEqual(POP_SMEAR_PX[1]);
      const last = s.offsets.at(-1)!;
      expect(Math.hypot(last[0], last[1])).toBeCloseTo(s.length, 9);
      expect(s.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      // Along the trail: toward the motion copies.
      const c = p.offsetCopies[0]!;
      expect(last[0] * c.dx + last[1] * c.dy).toBeGreaterThan(0);
    }
  });

  it("keeps the dissolving, irregular hem: the pop frame passes the variants' edge metric", { timeout: 60000 }, () => {
    // A CRITICAL figure on the result panel is about 60 px wide; its image is 60 / FIT_W.
    const imagePx = 60 / FIT_W;
    for (let v = 0; v < VARIANT_COUNT; v++)
      for (const seed of SEEDS) {
        const p = placeGhost(null, { w: 318, h: 303 }, seed, { tier: 'critical' });
        const pop = popFrameGrid(alphaGrid(buildSilhouette(v, seed)), { seed, imagePx, peakAlpha: POP_ALPHA, placement: p });
        let peak = 0;
        for (const a of pop.alpha) peak = Math.max(peak, a);
        expect(peak).toBeLessThanOrEqual(POP_ALPHA + 1e-6);
        // The same metric and threshold as the variants, relative to the frame's peak.
        const rel = { ...pop, alpha: pop.alpha.map((a) => a / POP_ALPHA) };
        expect(edgeIrregularity(rel, SILHOUETTE_ALPHA), `edge v${v} s${seed}`).toBeGreaterThanOrEqual(1.25);
        // The hem stays ragged: the lowest visible cell varies across the figure.
        const lows: number[] = [];
        for (let x = 0; x < rel.w; x++) {
          let low = -1;
          for (let y = 0; y < rel.h; y++) if (rel.alpha[y * rel.w + x]! >= SILHOUETTE_ALPHA) low = y;
          if (low >= 0) lows.push(low);
        }
        const steps = lows.slice(1).filter((l, i) => l !== lows[i]).length;
        expect(steps, `hem v${v} s${seed}`).toBeGreaterThan(lows.length / 3);
      }
  });
});
