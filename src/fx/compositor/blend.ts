import { feedColor, TINT_SKSL_FN } from '../glass/feed';

/**
 * The compositor's per-pixel rule, in TS (for tests) and SkSL (for the device). Both must match.
 *
 * For a backdrop colour `bg` (0..1 per channel) and ghost alpha `a`:
 * 1. Occlusion: the ghost is hidden where the (slightly blurred) scene luma is above the region's
 *    80th percentile, with a soft ramp of `OCC_RAMP` luma. On a flat interior a synthesised
 *    foreground mass (`Band`, `bandMass`) hides it as well: a soft, out-of-focus mound in the
 *    scene's own colour (sampled just under the figure), rising from below into the figure's
 *    lower third. The mass is part of the scene: it is drawn with or without the ghost.
 * 2. Plus with white at the layer alpha: lift `min(a, 1 - bg)` per channel, so the ghost only adds
 *    light, by about the same amount over a dark or a bright backdrop. (Screen, `a * (1 - bg)`,
 *    adds almost nothing over a bright scene: on the bright fixture it lifted the figure box by
 *    2.4 luma.)
 * 3. Brightness clamp: the lift is scaled so the pixel's luma stays at or under `limit` (clamp
 *    reference + `CLAMP_LIFT` luma). With `peak` the layer's highest alpha and `t = a / peak`, the
 *    lift becomes `min(lift, min(allowed, peak) * t^GAMMA)` (on a near-black scene `allowed` is
 *    also capped at NEAR_BLACK_LIFT, so no pixel rises more than that): the figure's core lands on the limit,
 *    faint parts pass unchanged, and everything between keeps its gradient (feather, fades,
 *    density). Round 1 used `allowed * (1 - exp(-6 lift / allowed))`, which saturated every pixel
 *    above a third of the core's alpha, so fades and the outline's feather turned into a hard
 *    edge (the cut-out look, D-017). Never negative, never more than the unclamped lift.
 * 3b. Density: the ghost layer carries the figure's coarse interior density (40 to 100%) as its
 *    colour (premultiplied grey under the alpha). The clamped lift is scaled by it, so the patches
 *    show however hard the core sits on the limit. Scaling down never breaks steps 2 and 3. The
 *    near-black smudge (D-023) drops it (`densAmt` 0): a smudge has no interior to show.
 * 3c. Tint (A-08, D-045 ruling 2): the viewfinder's phosphor tint (`feedTint`, glass/feed.ts:
 *    35% ramp mix, lifted blacks, highlight knee) over the composited pixel, so the result and
 *    card photos keep the viewfinder's one hue. After the clamp, before the grain.
 * 0. Auto-gain (A-45): on a near-black scene the photo is multiplied by `gain` (autoGain.ts) before
 *    everything else; the clamp limit and the occlusion threshold are scaled with it.
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
/**
 * Most effective alpha the figure reaches on the jump-scare pop frame (D-023: capped at 0.30, so
 * the pop stays a soft lift, never an opaque cut-out). The layer's stacked peak (figure, copies
 * and echo) is raised to this and no further, and the clamp curve runs linear on the pop
 * (`POP_GAMMA`), so the hem's noise dissolve keeps its gradient instead of turning into a hard,
 * sawtooth edge.
 */
export const POP_ALPHA = 0.3;
/** Clamp curve exponent on the pop frame (1: linear, the hem dissolve passes through unchanged). */
export const POP_GAMMA = 1;
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

/**
 * Synthesised foreground mass (D-023), only on a flat interior: a soft mound rising from below
 * into the figure's lower third, in the scene's own colour (sampled at `sampleY` just under the
 * figure, blurred across x), that hides the ghost behind it. Panel pixels. Its top edge at x is
 * `top + hump * ((x - cx) / halfW)^2` plus a gentle noise of peak `rag` (phases `ph`); it fades
 * out at its sides past `halfW` and below `bottom`. Every edge is a BAND_SOFT ramp either way
 * (12 px across), so it reads out of focus, never as a hard or dark fringe.
 */
export interface Band {
  top: number;
  cx: number;
  halfW: number;
  hump: number;
  bottom: number;
  rag: number;
  ph: readonly [number, number, number];
  sampleY: number;
}
/** Wavenumbers of the mass's edge noise, per px (wavelengths about 80, 37 and 18 px: no teeth). */
export const BAND_K: readonly [number, number, number] = [0.08, 0.17, 0.35];
/** Half width of the mass's soft edges, px (a 12 px ramp: within the 10 to 16 px of D-023). */
export const BAND_SOFT = 6;
/** How much of the sampled colour covers the photo at the mass's core (the rest shows through). */
export const BAND_MIX = 0.85;
/** Colour taps across x (px apart) and down (px apart) for the mass's colour. */
export const BAND_TAP_X = 8;
export const BAND_TAP_Y = 4;

const softEdge = (x: number, a: number, b: number, c: number) =>
  (0.6 * Math.sin(x * BAND_K[0] + a) + 0.3 * Math.sin(x * BAND_K[1] + b) + 0.2 * Math.sin(x * BAND_K[2] + c)) / 1.1;

/** The mass's top edge at panel column `x` (px). */
export function bandTopAt(x: number, band: Band): number {
  const dx = (x - band.cx) / band.halfW;
  return band.top + band.hump * dx * dx + band.rag * softEdge(x, band.ph[0], band.ph[1], band.ph[2]);
}

/** Coverage 0..1 of the mass at a panel point (1 inside, 0 outside, soft between). */
export function bandMass(x: number, y: number, band: Band | null): number {
  if (!band) return 0;
  const top = bandTopAt(x, band);
  const below = smoothstep(top - BAND_SOFT, top + BAND_SOFT, y);
  const side = 1 - smoothstep(band.halfW - BAND_SOFT, band.halfW + BAND_SOFT, Math.abs(x - band.cx));
  const end = 1 - smoothstep(band.bottom - 2 * BAND_SOFT, band.bottom + 2 * BAND_SOFT, y);
  return below * side * end;
}

/** Ghost visibility 0..1 at a panel point behind the mass (1 outside it, 0 inside). */
export function bandVisibility(x: number, y: number, band: Band | null): number {
  return 1 - bandMass(x, y, band);
}

/**
 * How far above the mass's top edge the ghost starts to fade, px (A-98). The mass's own 12 px ramp
 * stays for its colour; the ghost's light fades over this much more, so the hem dissolves into the
 * mass instead of ending on a ragged line 12 px deep (the cut-out fringe: an 18 luma drop in 10 card
 * px on the cellar story card). Applied after the clamp, so the ramp is linear in light (before the
 * clamp the GAMMA curve turns a 0.1 visibility into 0.45 of the lift and the ramp into an edge).
 */
export const BAND_HEM = 26;

/**
 * Ghost light 0..1 left at a panel point by the mass (A-98): like `bandVisibility`, but the top
 * ramp runs from BAND_HEM above the edge to BAND_SOFT below it, and it is a factor on the clamped
 * lift, not on the layer's alpha.
 */
export function bandHem(x: number, y: number, band: Band | null): number {
  if (!band) return 1;
  const top = bandTopAt(x, band);
  const below = smoothstep(top - BAND_HEM, top + BAND_SOFT, y);
  const side = 1 - smoothstep(band.halfW - BAND_SOFT, band.halfW + BAND_SOFT, Math.abs(x - band.cx));
  const end = 1 - smoothstep(band.bottom - 2 * BAND_SOFT, band.bottom + 2 * BAND_SOFT, y);
  return 1 - below * side * end;
}

/**
 * The mass over the photo at one pixel: the photo mixed toward the mass colour (`col`, the
 * scene's colour under the figure) by BAND_MIX times the coverage.
 */
export function bandOver(bg: readonly number[], col: readonly number[], mass: number): RGB {
  const k = BAND_MIX * mass;
  return [bg[0]! + (col[0]! - bg[0]!) * k, bg[1]! + (col[1]! - bg[1]!) * k, bg[2]! + (col[2]! - bg[2]!) * k];
}

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
export function plusClamped(bg: readonly number[], a: number, limit: number, peak = a, o: { gamma?: number; liftCap?: number } = {}): RGB {
  const lift: RGB = [0, 0, 0];
  for (let i = 0; i < 3; i++) lift[i] = Math.min(a, 1 - bg[i]!);
  const l = luma(lift);
  const allowed = Math.min(o.liftCap ?? 1, Math.max(0, limit - luma(bg)));
  const t = peak > 1e-6 ? Math.min(1, a / peak) : 0;
  const target = Math.min(allowed, Math.max(peak, a)) * Math.pow(t, o.gamma ?? GAMMA);
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
  o: {
    limit: number;
    occLo: number;
    sceneLuma: number;
    noise: number;
    strength?: number;
    density?: number;
    peak?: number;
    gamma?: number;
    liftCap?: number;
    grain?: number;
    /** Mass coverage at this pixel (`bandMass`) and its colour. */
    mass?: number;
    massColor?: readonly number[];
    /** Ghost light the mass leaves at this pixel (`bandHem`), a factor on the clamped lift; default 1 - mass. */
    hem?: number;
    /** The phosphor tint after the clamp (glass/feed.ts), or none. */
    tint?: { mix: number; lift: number; knee: number };
  },
): RGB {
  const m = o.mass ?? 0;
  bg = m > 0 && o.massColor ? bandOver(bg, o.massColor, m) : bg;
  const a = ghostAlpha * (o.strength ?? 1) * occlusion(o.sceneLuma, o.occLo);
  const k = plusClamped(bg, a, o.limit, (o.peak ?? 1) * (o.strength ?? 1), { gamma: o.gamma, liftCap: o.liftCap });
  const d = Math.min(1, Math.max(0, o.density ?? 1)) * (o.hem ?? (1 - m));
  const c0: RGB = [bg[0]! + (k[0] - bg[0]!) * d, bg[1]! + (k[1] - bg[1]!) * d, bg[2]! + (k[2] - bg[2]!) * d];
  const c = o.tint && o.tint.mix > 0 ? feedColor(c0, o.tint.mix, o.tint.lift, o.tint.knee) : c0;
  const g = grainOffset(o.noise, o.grain);
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
uniform float liftCap;
uniform float occLo;
uniform float occRamp;
uniform float grain;
uniform float occRadius;
uniform float gammaK;
uniform float peak;
uniform float densAmt;
uniform float bandOn;
uniform float bandTop;
uniform float bandCx;
uniform float bandHalfW;
uniform float bandHump;
uniform float bandBottom;
uniform float bandRag;
uniform float bandSoft;
uniform float bandHemPx;
uniform float bandSampleY;
uniform float bandMix;
uniform float bandTapX;
uniform float bandTapY;
uniform float3 bandK;
uniform float3 bandPh;
uniform float gain;
uniform float tintMix;
uniform float tintLift;
uniform float tintKnee;

const half3 W = half3(${LUMA.join(', ')});
${TINT_SKSL_FN}

// The photo through the auto-gain (1 on every scene that is not near-black).
half3 P(float2 p) { return min(photo.eval(p).rgb * half(gain), half3(1.0)); }
float L(float2 p) { return dot(P(p), W); }

float softEdge(float x) {
  return (0.6 * sin(x * bandK.x + bandPh.x) + 0.3 * sin(x * bandK.y + bandPh.y) + 0.2 * sin(x * bandK.z + bandPh.z)) / 1.1;
}

// Twin of bandMass: 1 inside the synthesised foreground mass, 0 outside, soft between.
float bandMass(float2 xy) {
  if (bandOn < 0.5) return 0.0;
  float dx = (xy.x - bandCx) / bandHalfW;
  float top = bandTop + bandHump * dx * dx + bandRag * softEdge(xy.x);
  float below = smoothstep(top - bandSoft, top + bandSoft, xy.y);
  float side = 1.0 - smoothstep(bandHalfW - bandSoft, bandHalfW + bandSoft, abs(xy.x - bandCx));
  float end = 1.0 - smoothstep(bandBottom - 2.0 * bandSoft, bandBottom + 2.0 * bandSoft, xy.y);
  return below * side * end;
}

// Twin of bandHem: the ghost light the mass leaves (its top ramp starts bandHemPx above the edge).
float bandHem(float2 xy) {
  if (bandOn < 0.5) return 1.0;
  float dx = (xy.x - bandCx) / bandHalfW;
  float top = bandTop + bandHump * dx * dx + bandRag * softEdge(xy.x);
  float below = smoothstep(top - bandHemPx, top + bandSoft, xy.y);
  float side = 1.0 - smoothstep(bandHalfW - bandSoft, bandHalfW + bandSoft, abs(xy.x - bandCx));
  float end = 1.0 - smoothstep(bandBottom - 2.0 * bandSoft, bandBottom + 2.0 * bandSoft, xy.y);
  return 1.0 - below * side * end;
}

// The mass's colour: the scene just under the figure, averaged across x (out of focus).
half3 bandColor(float x) {
  half3 c = half3(0.0);
  for (int k = -3; k <= 3; k++) {
    float fx = x + float(k) * bandTapX;
    c += P(float2(fx, bandSampleY)) + P(float2(fx, bandSampleY + bandTapY));
  }
  return c / 14.0;
}

half4 main(float2 xy) {
  half3 bg = P(xy);
  float m = bandMass(xy);
  if (m > 0.001) bg = mix(bg, bandColor(xy.x), half(bandMix * m));
  float r = occRadius;
  // With the photo's luma grid (blurred, bilinear) the cut follows the scene's shapes in coherent
  // patches; without it, 9 taps of the photo.
  float scene = useGrid > 0.5 ? min(1.0, float(occl.eval(xy).r) * gain) : L(xy) * 0.2
    + (L(xy + float2(r, 0)) + L(xy - float2(r, 0)) + L(xy + float2(0, r)) + L(xy - float2(0, r))) * 0.12
    + (L(xy + float2(r, r) * 1.5) + L(xy - float2(r, r) * 1.5) + L(xy + float2(r, -r) * 1.5) + L(xy - float2(r, -r) * 1.5)) * 0.08;
  float vis = 1.0 - smoothstep(occLo, occLo + occRamp, scene);
  half4 gc = ghost.eval(xy);
  float a = gc.a * strength * vis;
  float dens = mix(1.0, gc.a > 1e-4 ? clamp(float(gc.r) / float(gc.a), 0.0, 1.0) : 1.0, densAmt);
  half3 lift = min(half3(a), 1.0 - bg);
  float l = dot(lift, W);
  float allowed = min(liftCap, max(0.0, limit - dot(bg, W)));
  float pk = peak * strength;
  float t = pk > 1e-6 ? min(1.0, a / pk) : 0.0;
  float target = min(allowed, max(pk, a)) * pow(t, gammaK);
  float k = (l > 1e-6 && allowed > 0.0) ? min(1.0, target / l) : 0.0;
  half3 c = bg + lift * k * dens * bandHem(xy);
  if (tintMix > 0.0) c = feedTint(c, tintMix, tintLift, tintKnee);
  half4 n = grainNoise.eval(xy);
  float v = n.a > 0.0 ? n.r / n.a : 0.5;
  float g = clamp((v - 0.5) * 4.0, -1.0, 1.0) * grain;
  return half4(clamp(c + g, 0.0, 1.0), 1.0);
}`;
