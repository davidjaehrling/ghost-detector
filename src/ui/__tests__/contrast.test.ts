import { describe, expect, it } from 'vitest';
import { color } from '../tokens';

// WCAG 2.x relative luminance and contrast ratio.
function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

describe('text contrast on the glass', () => {
  for (const fg of ['p3', 'p4', 'p5', 'n6'] as const) {
    for (const bg of ['n0', 'n1'] as const) {
      it(`${fg} on ${bg} is at least 4.5:1`, () => {
        expect(contrast(color[fg], color[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('matches the known p3 on n0 ratio', () => {
    expect(contrast(color.p3, color.n0)).toBeCloseTo(7.43, 1);
  });
});
