import { describe, expect, it } from 'vitest';
import { drawOutcome, freshHistory } from '../../../engine';
import { DEMO_CASES, DEMO_SEEDS, SCARE_CASE } from '../demo';
import { caseSeed, cropOnFigure, panelRegion, panelTop, tierOpacity } from '../panel';
import { readingsFor } from '../readings';
import { clock, stampText, thermalDelta } from '../stamp';
import { placeGhost } from '../../../fx/ghostV0/placement';

describe('data strip', () => {
  it('prints case, SPI, ΔT and the clock on one line', () => {
    const at = new Date(2026, 9, 13, 22, 48).getTime();
    expect(clock(at)).toBe('22:48');
    expect(stampText({ id: '0007', spi: 80, deltaC: -6.25, createdAt: at })).toBe('CASE 0007 · SPI 80 · ΔT -6.3 °C · 22:48');
  });

  it('pins ΔT to the cold spot on STRONG and CRITICAL, to THERM below', () => {
    const r = readingsFor(41, 'strong');
    expect(thermalDelta('strong', r)).toBe(r.coldSpotC);
    expect(thermalDelta('critical', r)).toBe(r.coldSpotC);
    expect(thermalDelta('active', r)).toBe(r.thermalC);
    expect(r.coldSpotC).not.toBe(r.thermalC);
  });
});

describe('demo seeds per tier and case', () => {
  // The cellar fixture's dark region as the compositor reads it (statsFromRgba on e2e/fixtures/cellar.png),
  // laid out for a 328 px wide glass with a 283 px photo window (390 px phone).
  const region = { x: 0, y: 0.5417, w: 0.4306, h: 0.4583, cx: 0.1938, cy: 0.7931, areaFraction: 0.1681 };
  const W = 328;
  const H = 283;
  const imgH = Math.round((W * 4) / 3);
  const rows = [
    { tier: 'active', seed: DEMO_SEEDS.active, id: DEMO_CASES.active },
    { tier: 'strong', seed: DEMO_SEEDS.strong, id: DEMO_CASES.strong },
    { tier: 'critical', seed: DEMO_SEEDS.critical, id: DEMO_CASES.critical },
    { tier: 'critical', seed: DEMO_SEEDS.critical, id: SCARE_CASE },
  ] as const;
  const spots = rows.map(({ tier, seed, id }) => {
    const cs = caseSeed(seed, id);
    const o = tierOpacity(tier);
    const top0 = panelTop(H, imgH, region.cy);
    const panel = panelRegion(region, imgH, H, top0);
    const p = placeGhost(panel, { w: W, h: H }, cs, { tier, ...(o.opacityRange ? { opacityRange: o.opacityRange } : {}), ...(o.tierCap ? { tierCap: o.tierCap } : {}) });
    const crop = cropOnFigure(H, imgH, top0, p);
    return { variant: cs % 6, cx: (p.x + p.w / 2) / W, top: crop.top };
  });

  it('draws the tier each demo is named for, with a figure', () => {
    for (const k of ['active', 'strong', 'critical'] as const) {
      const o = drawOutcome(DEMO_SEEDS[k], 'standard', freshHistory(0));
      expect(o.tier).toBe(k);
      expect(o.figureShown).toBe(true);
    }
  });

  it('gives ACTIVE, STRONG, CRITICAL and the scare four different variants', () => {
    expect(new Set(spots.map((s) => s.variant)).size).toBe(4);
  });

  it('stands them apart: 5% of the width in from the edge or 20 px of crop between any two', () => {
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++) {
        const dx = Math.abs(spots[i]!.cx - spots[j]!.cx);
        const dt = Math.abs(spots[i]!.top - spots[j]!.top);
        expect(dx >= 0.05 || dt >= 20, `${i} vs ${j}: dx ${dx.toFixed(3)} dtop ${dt}`).toBe(true);
      }
  });

  it('uses four different case numbers', () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(4);
  });
});
