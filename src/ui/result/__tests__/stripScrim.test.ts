import { describe, expect, it } from 'vitest';
import { MARK_CONTRAST_TARGET } from '../../../fx/share/constants';
import { color } from '../../tokens';
import { contrastRatio, luminance, stripScrimAlpha } from '../stripScrim';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe('strip scrim', () => {
  it('holds the card contrast target over a white photo', () => {
    const a = stripScrimAlpha();
    const n0 = rgb(color.n0);
    const grain = 0.04 * 255;
    const bg = [255, 255, 255].map((v, i) => a * n0[i]! + (1 - a) * v + grain);
    const lt = luminance(rgb(color.p3).map((v) => v - grain));
    expect(contrastRatio(lt, luminance(bg))).toBeGreaterThanOrEqual(MARK_CONTRAST_TARGET);
    expect(a).toBeGreaterThan(0.4);
  });

  it('is lighter over a darker photo', () => {
    expect(stripScrimAlpha(color.p3, [60, 60, 60])).toBeLessThan(stripScrimAlpha());
  });
});
