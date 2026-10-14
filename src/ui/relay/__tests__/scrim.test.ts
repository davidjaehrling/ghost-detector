import { describe, expect, it } from 'vitest';
import { contrastRatio, luminance, stripScrimAlpha } from '../../result/stripScrim';
import { color } from '../../tokens';
import { RELAY_GROUND, RELAY_SCRIM } from '../scrim';

const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe('relay band fill', () => {
  it('is the strip scrim function, and no heavier than the strip itself', () => {
    expect(RELAY_SCRIM).toBe(stripScrimAlpha(color.p3, RELAY_GROUND));
    expect(RELAY_SCRIM).toBeLessThanOrEqual(stripScrimAlpha());
  });
  it('keeps p3 body text at 4.5:1 over the brightest feed', () => {
    const n0 = rgb(color.n0);
    const bg = RELAY_GROUND.map((v, i) => RELAY_SCRIM * n0[i]! + (1 - RELAY_SCRIM) * v);
    expect(contrastRatio(luminance(rgb(color.p3)), luminance(bg))).toBeGreaterThanOrEqual(4.5);
  });
});
