import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia';

import type { Tier } from '../../engine';
import { FIT_H, FIT_W } from '../apparition';
import { stackedAlpha, type Placement, type RegionInput } from '../ghostV0/placement';
import { BAND_K, BAND_MIX, BAND_SOFT, BAND_TAP_X, BAND_TAP_Y, CLAMP_LIFT, GAMMA, GRAIN, OCC_GRID_BLUR, POP_ALPHA, POP_GAMMA, POP_LIFT } from './blend';
import { NEAR_BLACK_BLUR, NEAR_BLACK_CAP, NEAR_BLACK_GRAIN, NEAR_BLACK_LIFT, NEAR_BLACK_PEAK, reference, smudgePlacement, type Reference } from './reference';
import { occlusionGrid, type LumaGrid } from './regionStats';

// The compositor's set-up, shared by the on-screen <Composite> and the offscreen render
// (`offscreen.ts`, used by the share card): the clamp reference, the near-black fallback and every
// uniform of COMPOSITE_SKSL except the fade. Pure apart from the Skia image helpers at the bottom.

/** Radius of the scene-luma taps for the occlusion mask, in layout pixels. */
export const OCC_RADIUS = 3;
/** Grain FractalNoise frequency (per layout pixel), as in the Skia probe. */
export const GRAIN_FREQ = 0.9;

export interface PhotoRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SetupInput {
  photoRect: PhotoRect;
  region?: RegionInput | null;
  meanLuma: number;
  p80Luma?: number;
  p90Luma?: number;
  grid?: LumaGrid;
  placement: Placement;
  tier?: Tier;
  seed: number;
}

export interface CompositeSetup {
  ref: Reference;
  nearBlack: boolean;
  /** The placement drawn (the smudge on a near-black scene). */
  placement: Placement;
  tier: Tier | undefined;
  /** Highest alpha the layer reaches (before the pop gain). */
  peak: number;
  grain: number;
  /** Blur factor for buildGhostLayer. */
  blur: number;
}

export function compositeSetup(i: SetupInput): CompositeSetup {
  const ref = reference({ meanLuma: i.meanLuma, p80Luma: i.p80Luma, p90Luma: i.p90Luma, region: i.region, grid: i.grid, placement: i.placement, photoRect: i.photoRect, seed: i.seed >>> 0 });
  return setupFromReference(ref, i.placement, i.tier);
}

/** Near-black scene (D-023): the TRACE-style smudge, 0.7 scale at the lowest opacity band. */
export function setupFromReference(ref: Reference, given: Placement, tierIn: Tier | undefined): CompositeSetup {
  const nearBlack = !!ref.nearBlack;
  const placement = nearBlack ? smudgePlacement(given) : given;
  // On the near-black smudge the heavy blur spreads the layer to about NEAR_BLACK_PEAK of the
  // stacked bound, so the clamp's reference peak follows it and the smudge's core reaches its ceiling.
  const peak = stackedAlpha(placement) * (nearBlack ? NEAR_BLACK_PEAK : 1);
  return { ref, nearBlack, placement, tier: nearBlack ? 'trace' : tierIn, peak, grain: GRAIN * (nearBlack ? NEAR_BLACK_GRAIN : 1), blur: nearBlack ? NEAR_BLACK_BLUR : 1 };
}

/** COMPOSITE_SKSL uniforms for a set-up, a pop value and the ghost's strength (fade x on/off). */
export function compositeUniforms(s: CompositeSetup, o: { pop: number; on: number; useGrid: boolean; grain?: number }) {
  const { ref, nearBlack, peak } = s;
  const pop = Math.min(1, Math.max(0, o.pop));
  // A near-black scene keeps its hard ceiling on the pop too.
  const clampLift = nearBlack ? NEAR_BLACK_LIFT : CLAMP_LIFT + pop * POP_LIFT;
  // In the compositor the near-black ceiling sits at NEAR_BLACK_CAP (under the published 18): the
  // glass over the panel adds a little to what the composite lifts.
  const limit = Math.min(255, ref.mean + (nearBlack ? NEAR_BLACK_CAP : clampLift)) / 255;
  const liftCap = nearBlack ? NEAR_BLACK_CAP / 255 : 1;
  // On the pop frame the layer's stacked peak goes to POP_ALPHA, a cap (never above it), and the
  // clamp curve runs linear, so the hem keeps its dissolve.
  const gain = 1 + pop * (POP_ALPHA / Math.max(0.01, peak) - 1);
  const band = ref.band;
  return {
    clampLift,
    gain,
    values: {
      useGrid: o.useGrid && ref.source === 'figure' ? 1 : 0,
      strength: o.on * gain,
      limit,
      liftCap,
      occLo: Math.min(255, ref.occ) / 255,
      occRamp: ref.ramp / 255,
      grain: o.grain ?? s.grain,
      occRadius: OCC_RADIUS,
      gammaK: GAMMA + pop * (POP_GAMMA - GAMMA),
      peak,
      // The smudge has no interior: no density patches on a near-black scene.
      densAmt: nearBlack ? 0 : 1,
      bandOn: band ? 1 : 0,
      bandTop: band?.top ?? 0,
      bandCx: band?.cx ?? 0,
      bandHalfW: band?.halfW ?? 1,
      bandHump: band?.hump ?? 0,
      bandBottom: band?.bottom ?? 0,
      bandRag: band?.rag ?? 0,
      bandSoft: BAND_SOFT,
      bandSampleY: band?.sampleY ?? 0,
      bandMix: BAND_MIX,
      bandTapX: BAND_TAP_X,
      bandTapY: BAND_TAP_Y,
      bandK: [...BAND_K],
      bandPh: band ? [band.ph[0], band.ph[1], band.ph[2]] : [0, 0, 0],
    },
  };
}

export function coverRect(img: SkImage | null, w: number, h: number): PhotoRect {
  if (!img) return { x: 0, y: 0, width: w, height: h };
  const s = Math.max(w / img.width(), h / img.height());
  const width = img.width() * s;
  const height = img.height() * s;
  return { x: (w - width) / 2, y: (h - height) / 2, width, height };
}

/** The blurred luma grid as an opaque grey image (luma in every channel), or a 1 x 1 stand-in. */
export function gridImage(grid: LumaGrid | undefined): SkImage | null {
  const g = grid ? occlusionGrid(grid, OCC_GRID_BLUR) : { luma: new Uint8Array([0]), width: 1, height: 1 };
  const px = new Uint8Array(g.width * g.height * 4);
  for (let i = 0; i < g.luma.length; i++) {
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = g.luma[i]!;
    px[i * 4 + 3] = 255;
  }
  return Skia.Image.MakeImage({ width: g.width, height: g.height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque }, Skia.Data.fromBytes(px), g.width * 4);
}

/** Apparition image size for a figure box: device pixels, rounded up to 16 so sizes repeat (cache). */
export function figureSize(p: Placement, scale: number): { width: number; height: number } {
  const r = (v: number) => Math.max(16, Math.ceil((v * scale) / 16) * 16);
  return { width: r(p.w / FIT_W), height: r(p.h / FIT_H) };
}
