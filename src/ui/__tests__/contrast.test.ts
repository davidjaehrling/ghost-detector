import { describe, expect, it } from 'vitest';
import { RELAY_GROUND, RELAY_SCRIM } from '../relay/scrim';
import { stripScrimAlpha } from '../result/stripScrim';
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

// P8-04 clause 5. Every readout level used on the phosphor, measured from the tokens at the worst case the
// screens can show: the strip and the relay band sit over the feed or the photo, so the ground is the n0 scrim
// blended over a white photo (the brightest feed), with 4% grain pushing the ground up and the text down.
const rgbOf = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hexOf = (c: readonly number[]) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
const GRAIN = 0.04 * 255;
/** `fg` at `alpha` over `bg`. */
const over = (fg: string, alpha: number, bg: string) => hexOf(rgbOf(fg).map((v, i) => v * alpha + rgbOf(bg)[i]! * (1 - alpha)));
/** The scrim over `ground` (0..255 channels) with the grain lifting it. */
const scrimGround = (alpha: number, ground: readonly number[]) => hexOf(ground.map((v, i) => alpha * rgbOf(color.n0)[i]! + (1 - alpha) * v + GRAIN));
const grainText = (hex: string) => hexOf(rgbOf(hex).map((v) => v - GRAIN));

describe('readouts on the result strip scrim (white photo, grain)', () => {
  const ground = scrimGround(stripScrimAlpha(), [255, 255, 255]);
  for (const fg of ['p3', 'p4', 'p5'] as const) {
    it(`${fg} on the strip scrim is at least 4.5:1`, () => {
      expect(contrast(grainText(color[fg]), ground)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('relay band text (brightest feed under the dim layer)', () => {
  const ground = scrimGround(RELAY_SCRIM, RELAY_GROUND);
  // header p4, sentences p3, the simulated sentence p4, the result line p5.
  for (const fg of ['p3', 'p4', 'p5'] as const) {
    it(`${fg} on the relay band is at least 4.5:1`, () => {
      expect(contrast(grainText(color[fg]), ground)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('key legends on the cap', () => {
  it('the live legend (n6 at 0.85 opacity) on the n2 cap is at least 4.5:1', () => {
    expect(contrast(over(color.n6, 0.85, color.n2), color.n2)).toBeGreaterThanOrEqual(4.5);
  });
  it('the lit legend (p5) on the n2 cap is at least 4.5:1', () => {
    expect(contrast(color.p5, color.n2)).toBeGreaterThanOrEqual(4.5);
  });
  // The engraved but inactive legend (n4 on n2, KEY inert) is exempt: WCAG 1.4.3 does not apply to inactive controls.
});
