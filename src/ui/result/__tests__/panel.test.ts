import { describe, expect, it } from 'vitest';
import { MAX_AREA_FRACTION, placeGhost } from '../../../fx/ghostV0/placement';
import { panelRegion, panelTop } from '../panel';

const W = 320;
const IMG_H = Math.round(W * (4 / 3));
const region = { x: 0.1, y: 0.55, w: 0.5, h: 0.3, cx: 0.35, cy: 0.7, areaFraction: 0.15 };

describe('result photo panel', () => {
  it('centres the crop on the region and stays inside the image', () => {
    const top = panelTop(298, IMG_H, region.cy);
    expect(top).toBeLessThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(298 - IMG_H);
    expect(panelTop(298, IMG_H, 0)).toBe(0);
    expect(panelTop(298, IMG_H, 1)).toBe(298 - IMG_H);
    expect(panelTop(IMG_H + 10, IMG_H, 0.5)).toBe(0);
  });

  it('maps the region into panel space and clips it', () => {
    const top = panelTop(298, IMG_H, region.cy);
    const r = panelRegion(region, IMG_H, 298, top)!;
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y + r.h).toBeLessThanOrEqual(1);
    expect(r.cy).toBeGreaterThanOrEqual(r.y);
    expect(panelRegion(region, IMG_H, 298, -IMG_H)).toBeNull();
    expect(panelRegion(null, IMG_H, 298, 0)).toBeNull();
  });

  it('the 15% cap holds against the visible panel for any seed', () => {
    for (const panelH of [260, 298, 330]) {
      const top = panelTop(panelH, IMG_H, region.cy);
      const r = panelRegion(region, IMG_H, panelH, top);
      for (let seed = 1; seed <= 60; seed++) {
        const p = placeGhost(r, { w: W, h: panelH }, seed);
        const ex = Math.max(0, ...p.offsetCopies.map((c) => Math.abs(c.dx)));
        const ey = Math.max(0, ...p.offsetCopies.map((c) => Math.abs(c.dy)));
        expect((p.w + ex) * (p.h + ey)).toBeLessThanOrEqual(MAX_AREA_FRACTION * W * panelH + 1);
        expect(p.x).toBeGreaterThanOrEqual(-1);
        expect(p.y).toBeGreaterThanOrEqual(-1);
        expect(p.y + p.h).toBeLessThanOrEqual(panelH + 1);
      }
    }
  });
});
