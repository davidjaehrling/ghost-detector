import { describe, expect, it } from 'vitest';

import { mulberry32 } from '../../../engine';
import { BAND_MIX, bandOver, CLAMP_LIFT, compositePixel, grainOffset, luma, occlusion, OCC_RAMP, plusClamped } from '../blend';
import { NEAR_BLACK_GRAIN, NEAR_BLACK_LIFT } from '../reference';

const rnd = mulberry32(2024);
const rgb = () => [rnd(), rnd(), rnd()];

describe('plusClamped', () => {
  it('never darkens, never adds more than the plain Plus blend, and never lifts past the limit', () => {
    for (let i = 0; i < 20000; i++) {
      const bg = rnd() < 0.5 ? rgb().map((v) => v * 0.25) : rgb();
      const a = rnd() * 0.35;
      const limit = Math.min(1, luma(bg) + (rnd() * 60 - 20) / 255);
      const out = plusClamped(bg, a, limit);
      for (let c = 0; c < 3; c++) {
        expect(out[c]).toBeGreaterThanOrEqual(bg[c]! - 1e-9);
        expect(out[c] - bg[c]!).toBeLessThanOrEqual(Math.min(a, 1 - bg[c]!) + 1e-9);
      }
      expect(luma(out)).toBeLessThanOrEqual(Math.max(limit, luma(bg)) + 1e-9);
    }
  });

  it('never lifts past the limit or above the plain blend with a layer peak either', () => {
    for (let i = 0; i < 20000; i++) {
      const bg = rgb().map((v) => v * 0.6);
      const peak = 0.05 + rnd() * 0.3;
      const a = rnd() * peak;
      const limit = Math.min(1, luma(bg) + (rnd() * 60 - 20) / 255);
      const out = plusClamped(bg, a, limit, peak);
      for (let c = 0; c < 3; c++) expect(out[c] - bg[c]!).toBeLessThanOrEqual(Math.min(a, 1 - bg[c]!) + 1e-9);
      expect(luma(out)).toBeLessThanOrEqual(Math.max(limit, luma(bg)) + 1e-9);
    }
  });

  it('keeps a fade a fade: no step where the alpha falls off smoothly (D-017)', () => {
    // A strong figure (peak 0.3, about 2.5x the room under the limit) fading to nothing: the lift
    // falls smoothly, and the half-alpha point is well under the core (round 1 saturated it).
    const bg = [0.03, 0.03, 0.03];
    const limit = luma(bg) + CLAMP_LIFT / 255;
    const lift = (a: number) => (luma(plusClamped(bg, a, limit, 0.3)) - luma(bg)) * 255;
    expect(lift(0.3)).toBeCloseTo(CLAMP_LIFT, 6);
    expect(lift(0.15) / lift(0.3)).toBeLessThan(0.8);
    expect(lift(0.15) / lift(0.3)).toBeGreaterThan(0.5);
    let prev = 0;
    for (let a = 0.003; a <= 0.3; a += 0.003) {
      const l = lift(a);
      expect(l - prev).toBeLessThan(1.6);
      prev = l;
    }
  });

  it('is monotone in the ghost alpha', () => {
    const bg = [0.05, 0.06, 0.04];
    const limit = luma(bg) + CLAMP_LIFT / 255;
    let prev = -1;
    for (let a = 0; a <= 0.3; a += 0.01) {
      const l = luma(plusClamped(bg, a, limit, 0.3));
      expect(l).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = l;
    }
  });

  it('a strong ghost over the region mean ends just under mean + CLAMP_LIFT luma', () => {
    const g = 20 / 255;
    const out = plusClamped([g, g, g], 0.25, g + CLAMP_LIFT / 255);
    const lift = (luma(out) - g) * 255;
    expect(lift).toBeGreaterThan(CLAMP_LIFT - 1e-6);
    expect(lift).toBeLessThanOrEqual(CLAMP_LIFT + 1e-9);
  });

  it('adds about as much over a bright backdrop as over a dark one (Plus, not Screen)', () => {
    const dark = 20 / 255;
    const bright = 200 / 255;
    const a = 0.06;
    const liftDark = luma(plusClamped([dark, dark, dark], a, 1)) - dark;
    const liftBright = luma(plusClamped([bright, bright, bright], a, 1)) - bright;
    expect(liftBright / liftDark).toBeGreaterThan(0.95);
  });
});

describe('occlusion and grain', () => {
  it('hides the ghost above the 80th percentile with a soft ramp', () => {
    const p80 = 30 / 255;
    expect(occlusion(p80 - 0.01, p80)).toBe(1);
    expect(occlusion(p80 + OCC_RAMP / 255 + 0.01, p80)).toBe(0);
    expect(occlusion(p80 + OCC_RAMP / 510, p80)).toBeCloseTo(0.5, 5);
  });

  it('grain is 4% at most and identical with and without the ghost, so the difference never goes negative', () => {
    expect(Math.abs(grainOffset(0))).toBeCloseTo(0.04, 9);
    expect(Math.abs(grainOffset(1))).toBeCloseTo(0.04, 9);
    for (let i = 0; i < 20000; i++) {
      const bg = rgb();
      const o = { limit: luma(bg) + (rnd() * 40) / 255, occLo: rnd(), sceneLuma: rnd(), noise: rnd() };
      const withGhost = compositePixel(bg, rnd() * 0.3, o);
      const without = compositePixel(bg, rnd() * 0.3, { ...o, strength: 0 });
      for (let c = 0; c < 3; c++) expect(Math.round(withGhost[c] * 255)).toBeGreaterThanOrEqual(Math.round(without[c] * 255));
    }
  });
});

describe('near-black ceiling and the foreground mass (D-023)', () => {
  it('on a near-black scene no pixel is lifted more than NEAR_BLACK_LIFT, nor past mean + NEAR_BLACK_LIFT', () => {
    expect(NEAR_BLACK_LIFT).toBe(18);
    expect(NEAR_BLACK_GRAIN).toBe(1.5);
    for (let i = 0; i < 20000; i++) {
      const bg = rgb().map((v) => v * 0.05);
      const mean = rnd() * 12;
      const peak = 0.05 + rnd() * 0.25;
      const out = plusClamped(bg, rnd() * peak, (mean + NEAR_BLACK_LIFT) / 255, peak, { liftCap: NEAR_BLACK_LIFT / 255 });
      expect((luma(out) - luma(bg)) * 255).toBeLessThanOrEqual(NEAR_BLACK_LIFT + 1e-6);
      expect(luma(out) * 255).toBeLessThanOrEqual(Math.max(mean + NEAR_BLACK_LIFT, luma(bg) * 255) + 1e-6);
    }
  });

  it('the mass takes the sampled scene colour, never black, and the ghost behind it still never darkens', () => {
    const col = [0.3, 0.25, 0.2];
    const over = bandOver([0.1, 0.1, 0.1], col, 1);
    for (let c = 0; c < 3; c++) expect(over[c]).toBeCloseTo(0.1 + (col[c]! - 0.1) * BAND_MIX, 9);
    expect(bandOver([0.5, 0.4, 0.3], col, 0)).toEqual([0.5, 0.4, 0.3]);
    for (let i = 0; i < 5000; i++) {
      const bg = rgb();
      const o = { limit: luma(bg) + (rnd() * 40) / 255, occLo: 1, sceneLuma: 0, noise: rnd(), mass: rnd(), massColor: rgb() };
      const withGhost = compositePixel(bg, rnd() * 0.3, o);
      const without = compositePixel(bg, 0.3, { ...o, strength: 0 });
      for (let c = 0; c < 3; c++) expect(withGhost[c]).toBeGreaterThanOrEqual(without[c]! - 1e-9);
    }
  });
});
