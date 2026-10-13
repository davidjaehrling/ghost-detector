import { describe, expect, it } from 'vitest';

import { placeGhost } from '../../ghostV0/placement';
import { regionFromRgba } from '../../ghostV0/regionFromPixels';
import { mulberry32 } from '../../../engine';
import { bandVisibility, OCC_GRID_BLUR, OCC_RAMP } from '../blend';
import { layerCopies, motionCopies, ghostBlurSigma, MAX_COPIES, MIN_COPIES, SMEAR_PX, smearFor } from '../motion';
import { BAND_BOTTOM, BAND_H, bandCut, cellsUnderFigure, cutShare, FLAT_GRADIENT, gradientEnergy, OCC_CUT_MIN, OCC_RAMP_MIN, reference, unionBox } from '../reference';
import { estimateP80, halvingSteps, lumaUnder, occlusionGrid, REGION_GRID, statsFromRgba } from '../regionStats';

const W = 192;
const H = 256;

// Mid-grey wall with a dark patch lower left (as in the v0 region test), at 2x the grid size.
function scene(): Uint8Array {
  const px = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const dark = x >= 20 && x < 92 && y >= 140 && y < 236;
      const v = dark ? 18 + ((x + y) % 5) : 150 + ((x * 7 + y * 3) % 20);
      px[i] = px[i + 1] = px[i + 2] = v;
      px[i + 3] = 255;
    }
  return px;
}

describe('statsFromRgba', () => {
  it('matches the v0 region, mean and p90, and adds p80 and the grid', () => {
    const px = scene();
    const v1 = statsFromRgba(px, W, H);
    const v0 = regionFromRgba(px, W, H);
    expect(v1.region).toEqual(v0.region);
    expect(v1.meanLuma).toBeCloseTo(v0.meanLuma, 9);
    expect(v1.p90Luma).toBe(v0.p90Luma);
    expect(v1.p80Luma).toBeLessThanOrEqual(v1.p90Luma);
    expect(v1.p80Luma).toBeGreaterThanOrEqual(15);
    expect(Math.max(v1.grid.width, v1.grid.height)).toBe(REGION_GRID);
  });

  it('a bright frame has no region; stats then cover the whole frame', () => {
    const px = new Uint8Array(64 * 64 * 4).fill(220);
    const s = statsFromRgba(px, 64, 64);
    expect(s.region).toBeNull();
    expect(s.meanLuma).toBeCloseTo(220, 0);
    expect(s.p80Luma).toBe(220);
  });
});

describe('halvingSteps', () => {
  it('halves a camera photo until the long side is at most 192 px', () => {
    const steps = halvingSteps(3024, 4032);
    expect(steps.at(-1)).toEqual({ w: 95, h: 126 });
    expect(Math.max(steps.at(-1)!.w, steps.at(-1)!.h)).toBeLessThanOrEqual(2 * REGION_GRID);
    expect(steps.length).toBe(5);
  });

  it('does nothing for an image already small enough', () => {
    expect(halvingSteps(150, 190)).toEqual([]);
  });
});

describe('lumaUnder and estimateP80', () => {
  it('reads the cells under a normalised box, clipped to the photo', () => {
    const grid = { luma: Uint8Array.from({ length: 16 }, (_, i) => i * 10), width: 4, height: 4 };
    expect(lumaUnder(grid, { x: 0, y: 0, w: 0.5, h: 0.5 })).toEqual({ mean: (0 + 10 + 40 + 50) / 4, p80: 50 });
    expect(lumaUnder(grid, { x: 0.75, y: 0.75, w: 1, h: 1 })).toEqual({ mean: 150, p80: 150 });
    expect(lumaUnder(grid, { x: 1.2, y: 0, w: 0.2, h: 0.2 })).toBeNull();
  });

  it('estimates p80 between the mean and p90', () => {
    expect(estimateP80(20, 40)).toBe(34);
    expect(estimateP80(20)).toBe(41);
  });
});

describe('reference', () => {
  const px = scene();
  const stats = statsFromRgba(px, W, H);
  const frame = { w: 318, h: 424 };
  const placement = placeGhost(null, frame, 7);
  const photoRect = { x: 0, y: 0, width: 318, height: 424 };

  it('uses the scene under the figure when the grid is given, never below the region level', () => {
    const r = reference({ meanLuma: stats.meanLuma, p80Luma: stats.p80Luma, region: null, grid: stats.grid, placement, photoRect });
    expect(r.source).toBe('figure');
    const u = unionBox(placement);
    const local = lumaUnder(stats.grid, { x: u.x / 318, y: u.y / 424, w: u.w / 318, h: u.h / 424 })!;
    expect(r.mean).toBeCloseTo(Math.max(stats.meanLuma, local.mean), 9);
    // Never above the area's own 80th percentile; lowered only as far as the cut rule needs.
    expect(r.occ).toBeLessThanOrEqual(Math.max(stats.p80Luma, local.p80) + 1e-9);
    expect(r.cut!).toBeGreaterThanOrEqual(OCC_CUT_MIN);
    if (!r.band) expect(cutShare(cellsUnderFigure(occlusionGrid(stats.grid, OCC_GRID_BLUR), placement, photoRect), r.occ, r.ramp)).toBeGreaterThanOrEqual(OCC_CUT_MIN);
  });

  it('keeps the scene-edge occlusion (no band) where the scene has edges under the figure', () => {
    // Vertical stripes 12 cells wide, 40 luma apart: plenty of gradient everywhere.
    const width = 72;
    const height = 96;
    const luma = Uint8Array.from({ length: width * height }, (_, i) => (Math.floor((i % width) / 6) % 2 ? 60 : 20));
    const grid = { luma, width, height };
    for (let seed = 1; seed < 20; seed++) {
      const p = placeGhost(null, { w: 318, h: 424 }, seed, { tier: 'active' });
      expect(gradientEnergy(grid, p, photoRect)).toBeGreaterThan(FLAT_GRADIENT);
      const r = reference({ meanLuma: 40, p80Luma: 60, region: null, grid, placement: p, photoRect, seed });
      expect(r.band).toBeNull();
      expect(r.cut!).toBeGreaterThanOrEqual(OCC_CUT_MIN);
    }
  });

  it('on a flat scene (black or bright) a synthetic foreground band cuts at least 10% of the figure (D-022)', () => {
    const rnd = mulberry32(11);
    for (const base of [0, 2, 128, 221, 250]) {
      const width = 72;
      const height = 96;
      const luma = Uint8Array.from({ length: width * height }, () => Math.min(255, base + Math.floor(rnd() * 2)));
      const grid = { luma, width, height };
      for (let seed = 1; seed < 40; seed++) {
        for (const tier of ['active', 'strong', 'critical'] as const) {
          const p = placeGhost(null, { w: 318, h: 424 }, seed, { tier });
          const r = reference({ meanLuma: base, p80Luma: base + 1, region: null, grid, placement: p, photoRect, seed });
          const band = r.band!;
          expect(band, `base ${base} seed ${seed}`).not.toBeNull();
          expect(r.gradient!).toBeLessThan(FLAT_GRADIENT);
          // Height 15 to 30% of the figure, centred in its lower third.
          const h = (band.y1 - band.y0) / p.h;
          expect(h).toBeGreaterThanOrEqual(BAND_H[0] - 1e-9);
          expect(h).toBeLessThanOrEqual(BAND_H[1] + 1e-9);
          const c = ((band.y0 + band.y1) / 2 - p.y) / p.h;
          expect(c).toBeGreaterThanOrEqual(2 / 3 - 1e-9);
          expect(c).toBeLessThanOrEqual(1);
          // Its bottom at or past the end of the hem dissolve: nothing of the figure under it.
          expect((band.y1 - p.y) / p.h).toBeGreaterThanOrEqual(BAND_BOTTOM[0] - 1e-9);
          // At least 10% of the figure is hidden, by the band alone.
          expect(bandCut(band, p), `base ${base} seed ${seed} ${tier}`).toBeGreaterThanOrEqual(OCC_CUT_MIN);
          expect(r.cut!).toBeGreaterThanOrEqual(OCC_CUT_MIN);
          // Inside it the ghost is gone; well above it untouched; its edge is ragged, not a line.
          const mid = (band.y0 + band.y1) / 2 + band.slope * (p.x + p.w / 2 - band.cx);
          expect(bandVisibility(p.x + p.w / 2, mid, band)).toBeLessThan(0.01);
          expect(bandVisibility(p.x + p.w / 2, p.y + p.h * 0.2, band)).toBe(1);
          const edgeAt = (x: number) => {
            let y = p.y;
            while (bandVisibility(x, y, band) > 0.5 && y < p.y + 2 * p.h) y += 0.25;
            return y - band.slope * (x - band.cx);
          };
          const ys = Array.from({ length: 20 }, (_, i) => edgeAt(p.x + (p.w * i) / 19));
          expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(band.rag / 2);
        }
      }
    }
  });

  it('cuts at least 10% of the figure on a dark, nearly flat scene (D-017, D-022)', () => {
    const rnd = mulberry32(5);
    for (const base of [2, 8, 20]) {
      const width = 72;
      const height = 96;
      const luma = new Uint8Array(width * height);
      for (let i = 0; i < luma.length; i++) luma[i] = base + Math.floor(rnd() * 5);
      const grid = { luma, width, height };
      for (let seed = 1; seed < 40; seed++) {
        const p = placeGhost(null, { w: 318, h: 424 }, seed, { tier: 'active' });
        const r = reference({ meanLuma: base + 2, p80Luma: base + 4, region: null, grid, placement: p, photoRect, seed });
        expect(r.cut!, `base ${base} seed ${seed}`).toBeGreaterThanOrEqual(OCC_CUT_MIN);
        // A patchy or banded cut, not an even dimming: some cells stay fully visible.
        const cells = cellsUnderFigure(occlusionGrid(grid, OCC_GRID_BLUR), p, photoRect);
        expect(cells.some((v) => v <= r.occ)).toBe(true);
        expect(r.ramp).toBeGreaterThanOrEqual(OCC_RAMP_MIN);
      }
    }
  });

  it('falls back to the region statistics without a grid', () => {
    const r = reference({ meanLuma: 12, p80Luma: 20, p90Luma: 30, region: null, placement, photoRect });
    expect(r).toEqual({ mean: 12, occ: 30, ramp: OCC_RAMP, source: 'region', band: null });
    expect(reference({ meanLuma: 12, p80Luma: 20, placement, photoRect }).occ).toBe(20);
  });

  it('the union box contains the figure and every copy', () => {
    const u = unionBox(placement);
    for (const c of [{ dx: 0, dy: 0 }, ...placement.offsetCopies]) {
      expect(placement.x + c.dx).toBeGreaterThanOrEqual(u.x - 1e-9);
      expect(placement.x + c.dx + placement.w).toBeLessThanOrEqual(u.x + u.w + 1e-9);
      expect(placement.y + c.dy).toBeGreaterThanOrEqual(u.y - 1e-9);
      expect(placement.y + c.dy + placement.h).toBeLessThanOrEqual(u.y + u.h + 1e-9);
    }
  });
});

describe('motion copies and blur', () => {
  it('always gives 3 to 5 copies and keeps the alpha budget and reach', () => {
    for (let seed = 1; seed < 400; seed++) {
      for (const tier of ['active', 'critical'] as const) {
        const p = placeGhost(null, { w: 318, h: 303 }, seed, { tier });
        const m = motionCopies(p.offsetCopies);
        expect(m.length).toBeGreaterThanOrEqual(MIN_COPIES);
        expect(m.length).toBeLessThanOrEqual(MAX_COPIES);
        const sum = (cs: { alpha: number }[]) => cs.reduce((s, c) => s + c.alpha, 0);
        expect(sum(m)).toBeCloseTo(sum(p.offsetCopies), 9);
        const reach = (cs: { dx: number; dy: number }[]) => Math.max(...cs.map((c) => Math.hypot(c.dx, c.dy)));
        expect(reach(m)).toBeCloseTo(reach(p.offsetCopies), 9);
      }
    }
  });

  it('draws one visible second copy on CRITICAL: 8 to 12 px off, 45% of the main alpha (D-022)', () => {
    for (let seed = 1; seed < 400; seed++) {
      const crit = placeGhost(null, { w: 318, h: 303 }, seed, { tier: 'critical' });
      const layers = layerCopies(crit);
      const m = motionCopies(crit.offsetCopies);
      // Echo + motion copies + the figure.
      expect(layers.length).toBe(m.length + 2);
      expect(layers.at(-1)).toEqual({ dx: 0, dy: 0, alpha: 1 });
      const echo = layers[0]!;
      expect(echo.alpha / layers.at(-1)!.alpha).toBeCloseTo(0.45, 9);
      const d = Math.hypot(echo.dx, echo.dy);
      expect(d).toBeGreaterThanOrEqual(8);
      expect(d).toBeLessThanOrEqual(12);
      // It is the strongest copy after the figure, so it reads as a second exposure, not a smear step.
      for (const c of layers.slice(1, -1)) expect(c.alpha).toBeLessThan(echo.alpha / 2);
      // Union box (figure, copies and echo) within 15% of the panel.
      const u = unionBox(crit);
      expect((u.w * u.h) / (318 * 303)).toBeLessThanOrEqual(0.15);
      const active = layerCopies(placeGhost(null, { w: 318, h: 303 }, seed, { tier: 'active' }));
      expect(active.length).toBe(motionCopies(placeGhost(null, { w: 318, h: 303 }, seed, { tier: 'active' }).offsetCopies).length + 1);
    }
  });

  it('smears one way, 6 to 10 px vertically, with weights that sum to 1', () => {
    for (let seed = 0; seed < 500; seed++) {
      const m = smearFor(seed);
      expect(m.length).toBeGreaterThanOrEqual(SMEAR_PX[0]);
      expect(m.length).toBeLessThanOrEqual(SMEAR_PX[1]);
      expect(Math.abs(m.offsets[0]!)).toBe(0);
      expect(Math.abs(m.offsets[m.offsets.length - 1]!)).toBeCloseTo(m.length, 9);
      expect(m.offsets.every((o) => o * m.dir >= 0)).toBe(true);
      expect(m.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      for (let k = 1; k < m.weights.length; k++) expect(m.weights[k]!).toBeLessThan(m.weights[k - 1]!);
    }
  });

  it('blurs the ghost (the scene gets none), more for the TRACE smudge', () => {
    expect(ghostBlurSigma(80, 'active')).toBeGreaterThan(1);
    expect(ghostBlurSigma(80, 'trace')).toBeGreaterThan(2 * ghostBlurSigma(80, 'active'));
  });
});
