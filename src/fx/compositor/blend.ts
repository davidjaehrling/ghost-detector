/**
 * The compositor's per-pixel rule, in TS (for tests) and SkSL (for the device). Both must match.
 *
 * For a backdrop colour `bg` (0..1 per channel) and ghost alpha `a`:
 * 1. Occlusion: the ghost is hidden where the (slightly blurred) scene luma is above the region's
 *    80th percentile, with a soft ramp of `OCC_RAMP` luma.
 * 2. Plus with white at the layer alpha: lift `min(a, 1 - bg)` per channel, so the ghost only adds
 *    light, by about the same amount over a dark or a bright backdrop. (Screen, `a * (1 - bg)`,
 *    adds almost nothing over a bright scene: on the bright fixture it lifted the figure box by
 *    2.4 luma.)
 * 3. Brightness clamp: the lift is scaled so the pixel's luma stays at or under `limit` (region
 *    mean + `CLAMP_LIFT` luma). The scaled lift is `min(lift, allowed * (1 - exp(-KNEE * lift /
 *    allowed)))`: faint edges pass unchanged, the core bends smoothly into the limit instead of
 *    cutting off flat. Never negative and never more than the unclamped lift, so no pixel darkens
 *    and nothing is brightened beyond what the blend gives.
 * 4. Grain after compositing: one signed, seeded FractalNoise value added to every channel over
 *    the whole panel. Adding the same value with and without the ghost keeps the order of pixel
 *    values, so the difference image still never goes negative.
 */

/** Luma (Rec. 601, the measurement script's weights). */
export const LUMA: readonly [number, number, number] = [0.299, 0.587, 0.114];
/** Peak ghost brightness above the region mean, in 0..255 luma (P3-04). */
export const CLAMP_LIFT = 24;
/** Width of the occlusion ramp above the 80th percentile, in 0..255 luma. */
export const OCC_RAMP = 10;
/** Knee sharpness of the clamp: higher reaches the limit sooner. */
export const KNEE = 6;
/** Grain amplitude after compositing (Bible: 4%). */
export const GRAIN = 0.04;

export type RGB = [number, number, number];

export const luma = (c: readonly number[]) => LUMA[0] * c[0]! + LUMA[1] * c[1]! + LUMA[2] * c[2]!;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Ghost visibility 0..1 for a scene luma (0..1) against the occlusion threshold (0..1). */
export function occlusion(sceneLuma: number, occLo: number): number {
  return 1 - smoothstep(occLo, occLo + OCC_RAMP / 255, sceneLuma);
}

/** Steps 2 and 3: add the ghost onto `bg` (Plus) and clamp the lift. All values 0..1. */
export function plusClamped(bg: readonly number[], a: number, limit: number): RGB {
  const lift: RGB = [0, 0, 0];
  for (let i = 0; i < 3; i++) lift[i] = Math.min(a, 1 - bg[i]!);
  const l = luma(lift);
  const allowed = Math.max(0, limit - luma(bg));
  const k = l > 1e-6 && allowed > 0 ? Math.min(1, (allowed * (1 - Math.exp((-KNEE * l) / allowed))) / l) : 0;
  return [bg[0]! + lift[0] * k, bg[1]! + lift[1] * k, bg[2]! + lift[2] * k];
}

/** Step 4: grain from a FractalNoise sample `v` (about 0.5 +- 0.25). */
export function grainOffset(v: number, amount = GRAIN): number {
  return Math.min(1, Math.max(-1, (v - 0.5) * 4)) * amount;
}

/** The whole rule for one pixel. `sceneLuma` is the blurred scene luma used by the occlusion. */
export function compositePixel(
  bg: readonly number[],
  ghostAlpha: number,
  o: { limit: number; occLo: number; sceneLuma: number; noise: number; strength?: number },
): RGB {
  const a = ghostAlpha * (o.strength ?? 1) * occlusion(o.sceneLuma, o.occLo);
  const c = plusClamped(bg, a, o.limit);
  const g = grainOffset(o.noise);
  return [Math.min(1, Math.max(0, c[0] + g)), Math.min(1, Math.max(0, c[1] + g)), Math.min(1, Math.max(0, c[2] + g))];
}

/**
 * SkSL twin of `compositePixel`. Children: the photo (panel coordinates), the ghost layer (alpha
 * carries the figure, copies and blur), FractalNoise for the grain.
 */
export const COMPOSITE_SKSL = `
uniform shader photo;
uniform shader ghost;
uniform shader grainNoise;
uniform float strength;
uniform float limit;
uniform float occLo;
uniform float occRamp;
uniform float grain;
uniform float occRadius;
uniform float knee;

const half3 W = half3(${LUMA.join(', ')});

float L(float2 p) { return dot(photo.eval(p).rgb, W); }

half4 main(float2 xy) {
  half4 bgc = photo.eval(xy);
  half3 bg = bgc.rgb;
  float r = occRadius;
  float scene = L(xy) * 0.2
    + (L(xy + float2(r, 0)) + L(xy - float2(r, 0)) + L(xy + float2(0, r)) + L(xy - float2(0, r))) * 0.12
    + (L(xy + float2(r, r) * 1.5) + L(xy - float2(r, r) * 1.5) + L(xy + float2(r, -r) * 1.5) + L(xy - float2(r, -r) * 1.5)) * 0.08;
  float vis = 1.0 - smoothstep(occLo, occLo + occRamp, scene);
  float a = ghost.eval(xy).a * strength * vis;
  half3 lift = min(half3(a), 1.0 - bg);
  float l = dot(lift, W);
  float allowed = max(0.0, limit - dot(bg, W));
  float k = (l > 1e-6 && allowed > 0.0) ? min(1.0, allowed * (1.0 - exp(-knee * l / allowed)) / l) : 0.0;
  half3 c = bg + lift * k;
  half4 n = grainNoise.eval(xy);
  float v = n.a > 0.0 ? n.r / n.a : 0.5;
  float g = clamp((v - 0.5) * 4.0, -1.0, 1.0) * grain;
  return half4(clamp(c + g, 0.0, 1.0), 1.0);
}`;
