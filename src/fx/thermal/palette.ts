/**
 * PH-WHT, phosphor white-hot (Bible sections 3 and 4, D-003): six stops, coldest `p0` to warmest
 * `p5`, evenly spaced, linear between stops. One hue; the digest's ironbow is not used.
 * Pure TS so the scale bar, the shader and the tests read the same table.
 */
import { color } from '../../ui/tokens';

export const PALETTE_NAME = 'PH-WHT';

export const PH_WHT: readonly string[] = [color.p0, color.p1, color.p2, color.p3, color.p4, color.p5];

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Colour at t in 0..1 (clamped) as 0..1 RGB, the same mapping the shader applies. */
export function phWht(t: number): [number, number, number] {
  const s = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (PH_WHT.length - 1);
  const i = Math.min(PH_WHT.length - 2, Math.floor(s));
  const f = s - i;
  const a = hexToRgb(PH_WHT[i]!);
  const b = hexToRgb(PH_WHT[i + 1]!);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Flat uniform list for the shader: six float3 stops in order. */
export function lutUniforms(): number[] {
  return PH_WHT.flatMap(hexToRgb);
}

/**
 * The SkSL that maps the encoded field (normalised temperature in the red channel, 0 = field
 * minimum, 1 = field maximum) to PH-WHT. Runs once per sensor pixel in the offscreen pass.
 */
export const PH_WHT_SKSL = `
uniform shader field;
uniform float3 c0;
uniform float3 c1;
uniform float3 c2;
uniform float3 c3;
uniform float3 c4;
uniform float3 c5;
half4 main(float2 xy) {
  float s = clamp(float(field.eval(xy).r), 0.0, 1.0) * 5.0;
  float3 c;
  if (s < 1.0) c = mix(c0, c1, s);
  else if (s < 2.0) c = mix(c1, c2, s - 1.0);
  else if (s < 3.0) c = mix(c2, c3, s - 2.0);
  else if (s < 4.0) c = mix(c3, c4, s - 3.0);
  else c = mix(c4, c5, s - 4.0);
  return half4(half3(c), 1.0);
}`;
