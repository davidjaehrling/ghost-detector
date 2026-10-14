// Pure half of <FeedTint>: the defaults and the TS twin of FEED_SKSL's colour step (no Skia).
import { PHOSPHOR, hexToRgb } from './color';

/** Default mix of the phosphor ramp over the picture's colour (D-017: 25 to 35%). */
export const FEED_MIX = 0.3;
/** Blacks lift toward p0 by this much (screen). */
export const FEED_LIFT = 0.55;

/** TS twin of the shader's colour step (no barrel), for tests. All values 0..1. */
export function feedColor(c: readonly [number, number, number], mix = FEED_MIX, lift = FEED_LIFT): [number, number, number] {
  const ph = PHOSPHOR.map(hexToRgb);
  const l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const s = Math.min(1, Math.max(0, l)) * 5;
  const i = Math.min(4, Math.floor(s));
  const f = s - i;
  const r = [0, 1, 2].map((j) => ph[i]![j]! + (ph[i + 1]![j]! - ph[i]![j]!) * f);
  return [0, 1, 2].map((j) => {
    const o = c[j]! + (r[j]! - c[j]!) * mix;
    const fl = ph[0]![j]! * lift;
    return fl + o * (1 - fl);
  }) as [number, number, number];
}

