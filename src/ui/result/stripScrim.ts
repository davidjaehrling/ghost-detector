import { MARK_CONTRAST_TARGET, STRIP_SCRIM_MIN } from '../../fx/share/constants';
import { color } from '../tokens';

// The data strip's scrim on the result photo (A-41). The share card picks its scrim from the card's
// contrast target (MARK_CONTRAST_TARGET, 5:1); the screen uses the same target against the worst
// case, a white photo under the strip with the grain pushing the ground up and the text down.

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** WCAG 2.x relative luminance of 0..255 sRGB channels. */
export function luminance([r, g, b]: readonly number[]): number {
  const f = (v: number) => {
    const c = Math.min(1, Math.max(0, v / 255));
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
}

export const contrastRatio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Grain on the glass over the strip, in 0..255 (4% photo grain). */
const GRAIN = 0.04 * 255;

/** Least n0 scrim alpha that keeps `text` at the card's contrast target over `ground` (default white). */
export function stripScrimAlpha(text: string = color.p3, ground: readonly number[] = [255, 255, 255]): number {
  const n0 = rgb(color.n0);
  const lt = luminance(rgb(text).map((v) => v - GRAIN));
  for (let a = STRIP_SCRIM_MIN; a < 1; a += 0.01) {
    const bg = ground.map((v, i) => a * n0[i]! + (1 - a) * v + GRAIN);
    if (contrastRatio(lt, luminance(bg)) >= MARK_CONTRAST_TARGET) return Math.round(a * 100) / 100;
  }
  return 1;
}
