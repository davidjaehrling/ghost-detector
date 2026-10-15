import { describe, expect, it } from 'vitest';

import { mulberry32 } from '../../../engine';
import { barDeltas } from '../encode';
import { BAR_INSET, BAR_W, PLATE_MAX_W, scaleGeometry, scaleLabels } from '../scale';
import { buildThermalField, formatDelta, type LumaGrid, type ThermalRegion } from '../thermalField';

// VT323 is monospaced: 6.4 px advance per glyph at the view's 16 px.
const VT_ADV = 6.4;
const w = (s: string) => s.length * VT_ADV;

function room(seed: number): { grid: LumaGrid; region: ThermalRegion } {
  const width = 72;
  const height = 96;
  const r = mulberry32(seed);
  const rx = 0.1 + r() * 0.45;
  const ry = 0.15 + r() * 0.45;
  const region = { x: rx, y: ry, w: 0.3, h: 0.35, cx: rx + 0.15, cy: ry + 0.175 };
  const luma = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const v = (y + 0.5) / height;
      const inside = u >= region.x && u <= region.x + region.w && v >= region.y && v <= region.y + region.h;
      luma[y * width + x] = inside ? 18 + Math.floor(r() * 6) : 110 + Math.round(80 * u) + Math.floor(r() * 10);
    }
  return { grid: { luma, width, height }, region };
}

describe('scale bar labels and plate (P8 QA golden review)', () => {
  it('labels read the bar ends in ΔT, and the bottom label is the SP1 ΔT readout (strong, critical)', () => {
    for (let k = 0; k < 6; k++)
      for (const tier of ['trace', 'active', 'strong', 'critical'] as const) {
        const { grid, region } = room(20 + k);
        const f = buildThermalField(grid, region, { seed: 100 + k, tier });
        const L = scaleLabels(f);
        const b = barDeltas(f);
        expect(`${L.hi} ${L.unit}`).toBe(formatDelta(b.hi));
        expect(`${L.lo} ${L.unit}`).toBe(formatDelta(b.lo));
        expect(L.amb).toBe('0.0');
        if (tier === 'strong' || tier === 'critical') expect(`${L.lo} ${L.unit}`, `${tier} ${k}`).toBe(formatDelta(f.coldSpotC!));
        // Four glyphs at most on these rooms, so the plate meets its width budget.
        const lw = Math.max(w(L.hi), w(L.lo), w(L.amb), w(L.unit));
        expect(scaleGeometry(318, 303, lw).plate.w, `${tier} ${k}`).toBeLessThanOrEqual(PLATE_MAX_W);
      }
  });

  it('the plate is the label column only: at most 36 px wide, ends at the bar, inside the panel', () => {
    const lw = w('-9.9');
    for (const [pw, ph] of [[288, 275], [318, 303], [356, 340], [318, 200], [318, 420]] as const) {
      const g = scaleGeometry(pw, ph, lw);
      expect(g.plate.w).toBeLessThanOrEqual(PLATE_MAX_W);
      expect(g.plate.x + g.plate.w).toBe(g.barX);
      expect(g.barX + BAR_W + BAR_INSET).toBe(pw);
      expect(g.plate.y).toBeGreaterThanOrEqual(2);
      expect(g.plate.y + g.plate.h).toBeLessThanOrEqual(ph - 2);
      // The photo's right edge stays visible: plate plus bar plus margin cover under 55 px (was about 70).
      expect(pw - g.plate.x).toBeLessThanOrEqual(PLATE_MAX_W + BAR_W + BAR_INSET);
    }
  });
});
