// Pure half of <FeedTint>: the defaults, the SkSL tint step shared by the feed, the compositor and
// the share card, and its TS twin (no Skia).
import { PHOSPHOR, hexToRgb } from './color';

/**
 * Mix of the phosphor ramp over the picture's colour: 35% (A-20, D-045 ruling 2; D-017 allowed 25
 * to 35%). The same step tints the viewfinder feed, the result photo and the card photo (A-08), so a
 * photo keeps its colour from the viewfinder to the card.
 */
export const FEED_MIX = 0.35;
/** Blacks lift toward p0 by this much (screen). */
export const FEED_LIFT = 0.55;
/**
 * Highlight knee (A-20): above this luma the output is compressed toward 1 (a soft shoulder that
 * reaches knee + (1 - knee) / 2 at white), so a bright room reads as lit glass, not a pale wash.
 */
export const FEED_KNEE = 0.7;

const vec = (c: readonly number[]) => `half3(${c.map((v) => v.toFixed(6)).join(', ')})`;

/**
 * SkSL: `half3 feedTint(half3 c, float mixAmt, float lift, float knee)`, the colour step on its own
 * (the phosphor ramp p0 to p5 baked in as constants). Paste into a shader that declares nothing
 * named FT_*.
 */
export const TINT_SKSL_FN = `
const half3 FT_W = half3(0.299, 0.587, 0.114);
${PHOSPHOR.map((h, i) => `const half3 FT_P${i} = ${vec(hexToRgb(h))};`).join('\n')}
half3 feedRamp(float s) {
  s = clamp(s, 0.0, 1.0) * 5.0;
  if (s < 1.0) return mix(FT_P0, FT_P1, half(s));
  if (s < 2.0) return mix(FT_P1, FT_P2, half(s - 1.0));
  if (s < 3.0) return mix(FT_P2, FT_P3, half(s - 2.0));
  if (s < 4.0) return mix(FT_P3, FT_P4, half(s - 3.0));
  return mix(FT_P4, FT_P5, half(s - 4.0));
}
half3 feedTint(half3 c, float mixAmt, float lift, float knee) {
  float l = float(dot(c, FT_W));
  half3 o = mix(c, feedRamp(l), half(mixAmt));
  half3 fl = FT_P0 * half(lift);
  o = fl + o * (1.0 - fl);
  float lo = float(dot(o, FT_W));
  if (knee < 1.0 && lo > knee) {
    float e = lo - knee;
    float lk = knee + e / (1.0 + e / (1.0 - knee));
    o = o * half(lk / lo);
  }
  return o;
}`;

/** Shoulder above `knee` (TS twin of the SkSL): identity below it, knee + (1 - knee) / 2 at 1. */
export function kneeLuma(l: number, knee = FEED_KNEE): number {
  if (knee >= 1 || l <= knee) return l;
  const e = l - knee;
  return knee + e / (1 + e / (1 - knee));
}

/** TS twin of `feedTint` (no barrel), for tests. All values 0..1. */
export function feedColor(c: readonly [number, number, number], mix = FEED_MIX, lift = FEED_LIFT, knee = FEED_KNEE): [number, number, number] {
  const ph = PHOSPHOR.map(hexToRgb);
  const l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const s = Math.min(1, Math.max(0, l)) * 5;
  const i = Math.min(4, Math.floor(s));
  const f = s - i;
  const r = [0, 1, 2].map((j) => ph[i]![j]! + (ph[i + 1]![j]! - ph[i]![j]!) * f);
  const o = [0, 1, 2].map((j) => {
    const v = c[j]! + (r[j]! - c[j]!) * mix;
    const fl = ph[0]![j]! * lift;
    return fl + v * (1 - fl);
  });
  const lo = 0.299 * o[0]! + 0.587 * o[1]! + 0.114 * o[2]!;
  const k = lo > 0 ? kneeLuma(lo, knee) / lo : 1;
  return [o[0]! * k, o[1]! * k, o[2]! * k];
}
