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
 * 3. Brightness clamp: the lift is scaled so the pixel's luma stays at or under `limit` (clamp
 *    reference + `CLAMP_LIFT` luma). With `peak` the layer's highest alpha and `t = a / peak`, the
 *    lift becomes `min(lift, min(allowed, peak) * t^GAMMA)`: the figure's core lands on the limit,
 *    faint parts pass unchanged, and everything between keeps its gradient (feather, fades,
 *    density). Round 1 used `allowed * (1 - exp(-6 lift / allowed))`, which saturated every pixel
 *    above a third of the core's alpha, so fades and the outline's feather turned into a hard
 *    edge (the cut-out look, D-017). Never negative, never more than the unclamped lift.
 * 3b. Density: the ghost layer carries the figure's coarse interior density (40 to 100%) as its
 *    colour (premultiplied grey under the alpha). The clamped lift is scaled by it, so the patches
 *    show however hard the core sits on the limit. Scaling down never breaks steps 2 and 3.
 * 4. Grain after compositing: one signed, seeded FractalNoise value added to every channel over
 *    the whole panel. Adding the same value with and without the ghost keeps the order of pixel
 *    values, so the difference image still never goes negative.
 */

/** Luma (Rec. 601, the measurement script's weights). */
export const LUMA: readonly [number, number, number] = [0.299, 0.587, 0.114];
/**
 * Peak ghost brightness above the clamp reference, in 0..255 luma (P3-04: just above the mean).
 * 24 in round 1; 34 since the interior density patches (D-017) take part of the light back and
 * the clamp curve no longer saturates the mid alphas.
 */
export const CLAMP_LIFT = 34;
/** Peak alpha of the figure on the jump-scare pop frame (D-017: 35 to 45%). */
export const POP_ALPHA = 0.4;
/** How far the clamp opens on the pop frame, luma. */
export const POP_LIFT = 40;
/** Width of the occlusion ramp above the 80th percentile, in 0..255 luma. */
export const OCC_RAMP = 10;
/**
 * Clamp curve exponent (step 3): below 1 the mid alphas of a figure whose core is over the limit
 * are lifted more than in proportion (so the figure keeps its light), while the curve stays
 * smooth, so no gradient turns into an edge.
 */
export const GAMMA = 0.35;
/** Box-blur radius (grid cells, 2 passes) of the luma grid the occlusion reads (see `occlusionGrid`). */
export const OCC_GRID_BLUR = 1;
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

/**
 * Steps 2 and 3: add the ghost onto `bg` (Plus) and clamp the lift. All values 0..1. `peak` is the
 * highest alpha the ghost layer reaches (default `a`: a lone pixel is its own peak).
 */
export function plusClamped(bg: readonly number[], a: number, limit: number, peak = a): RGB {
  const lift: RGB = [0, 0, 0];
  for (let i = 0; i < 3; i++) lift[i] = Math.min(a, 1 - bg[i]!);
  const l = luma(lift);
  const allowed = Math.max(0, limit - luma(bg));
  const t = peak > 1e-6 ? Math.min(1, a / peak) : 0;
  const target = Math.min(allowed, Math.max(peak, a)) * Math.pow(t, GAMMA);
  const k = l > 1e-6 && allowed > 0 ? Math.min(1, target / l) : 0;
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
  o: { limit: number; occLo: number; sceneLuma: number; noise: number; strength?: number; density?: number; peak?: number },
): RGB {
  const a = ghostAlpha * (o.strength ?? 1) * occlusion(o.sceneLuma, o.occLo);
  const k = plusClamped(bg, a, o.limit, (o.peak ?? 1) * (o.strength ?? 1));
  const d = Math.min(1, Math.max(0, o.density ?? 1));
  const c = [bg[0]! + (k[0] - bg[0]!) * d, bg[1]! + (k[1] - bg[1]!) * d, bg[2]! + (k[2] - bg[2]!) * d];
  const g = grainOffset(o.noise);
  return [Math.min(1, Math.max(0, c[0] + g)), Math.min(1, Math.max(0, c[1] + g)), Math.min(1, Math.max(0, c[2] + g))];
}

/**
 * SkSL twin of `compositePixel`. Children: the photo (panel coordinates), the ghost layer (alpha
 * carries the figure, copies and blur), FractalNoise for the grain, and the blurred luma grid for
 * the occlusion (`useGrid`; otherwise 9 taps of the photo).
 */
export const COMPOSITE_SKSL = `
uniform shader photo;
uniform shader ghost;
uniform shader grainNoise;
uniform shader occl;
uniform float useGrid;
uniform float strength;
uniform float limit;
uniform float occLo;
uniform float occRamp;
uniform float grain;
uniform float occRadius;
uniform float gammaK;
uniform float peak;

const half3 W = half3(${LUMA.join(', ')});

float L(float2 p) { return dot(photo.eval(p).rgb, W); }

half4 main(float2 xy) {
  half4 bgc = photo.eval(xy);
  half3 bg = bgc.rgb;
  float r = occRadius;
  // With the photo's luma grid (blurred, bilinear) the cut follows the scene's shapes in coherent
  // patches; without it, 9 taps of the photo.
  float scene = useGrid > 0.5 ? float(occl.eval(xy).r) : L(xy) * 0.2
    + (L(xy + float2(r, 0)) + L(xy - float2(r, 0)) + L(xy + float2(0, r)) + L(xy - float2(0, r))) * 0.12
    + (L(xy + float2(r, r) * 1.5) + L(xy - float2(r, r) * 1.5) + L(xy + float2(r, -r) * 1.5) + L(xy - float2(r, -r) * 1.5)) * 0.08;
  float vis = 1.0 - smoothstep(occLo, occLo + occRamp, scene);
  half4 gc = ghost.eval(xy);
  float a = gc.a * strength * vis;
  float dens = gc.a > 1e-4 ? clamp(float(gc.r) / float(gc.a), 0.0, 1.0) : 1.0;
  half3 lift = min(half3(a), 1.0 - bg);
  float l = dot(lift, W);
  float allowed = max(0.0, limit - dot(bg, W));
  float pk = peak * strength;
  float t = pk > 1e-6 ? min(1.0, a / pk) : 0.0;
  float target = min(allowed, max(pk, a)) * pow(t, gammaK);
  float k = (l > 1e-6 && allowed > 0.0) ? min(1.0, target / l) : 0.0;
  half3 c = bg + lift * k * dens;
  half4 n = grainNoise.eval(xy);
  float v = n.a > 0.0 ? n.r / n.a : 0.5;
  float g = clamp((v - 0.5) * 4.0, -1.0, 1.0) * grain;
  return half4(clamp(c + g, 0.0, 1.0), 1.0);
}`;
