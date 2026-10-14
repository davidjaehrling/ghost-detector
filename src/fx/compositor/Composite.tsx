import { AlphaType, ColorType, FractalNoise, ImageShader, Rect, Shader, Skia, useImage, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { PixelRatio, Platform, View } from 'react-native';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import type { Tier } from '../../engine';
import { FIT_H, FIT_W, renderApparition, VARIANT_COUNT } from '../apparition';
import { stackedAlpha, type Placement, type RegionInput } from '../ghostV0/placement';
import { BAND_K, BAND_MIX, BAND_SOFT, BAND_TAP_X, BAND_TAP_Y, CLAMP_LIFT, COMPOSITE_SKSL, GAMMA, GRAIN, OCC_GRID_BLUR, POP_ALPHA, POP_GAMMA, POP_LIFT, type Band } from './blend';
import { SnapshotCanvas } from '../glass/snapshotRegistry';
import { buildGhostLayer } from './ghostLayer';
import { NEAR_BLACK_BLUR, NEAR_BLACK_CAP, NEAR_BLACK_GRAIN, NEAR_BLACK_LIFT, NEAR_BLACK_PEAK, reference, smudgePlacement } from './reference';
import { occlusionGrid, type LumaGrid } from './regionStats';

const MATTES = {
  1: require('../../../assets/ghost/matte-1.png'),
  2: require('../../../assets/ghost/matte-2.png'),
  3: require('../../../assets/ghost/matte-3.png'),
} as const;

/** Grain FractalNoise frequency (per layout pixel), as in the Skia probe. */
const GRAIN_FREQ = 0.9;
/** Radius of the scene-luma taps for the occlusion mask, in layout pixels. */
const OCC_RADIUS = 3;

export interface PhotoRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CompositeProps {
  /** The photo: a decoded `SkImage` or a URI (file, http or bundled asset URI). */
  photo: SkImage | string;
  /** Panel size in layout pixels (the `frame` given to `placeGhost`). */
  width: number;
  height: number;
  /** Where the photo sits in the panel. Default: centred cover crop. The result screen passes `{ x: 0, y: top, width: W, height: imgH }`. */
  photoRect?: PhotoRect;
  /**
   * Dark region in panel space (what `placeGhost` got). When null the luma statistics describe the
   * whole frame, not a dark area, so the occlusion threshold moves up to p90.
   */
  region?: RegionInput | null;
  /** Region mean luma 0..255 (`regionFromImage`). The ghost never lifts a pixel above the clamp reference + CLAMP_LIFT. */
  meanLuma: number;
  /** Region 90th-percentile luma; with the mean, estimates p80 when `p80Luma` is absent. */
  p90Luma?: number;
  /** Region 80th-percentile luma: the ghost is hidden where the scene is brighter than this. */
  p80Luma?: number;
  /**
   * The photo's 96 px luma grid (`RegionStats.grid`). With it the clamp and occlusion use the
   * scene under the figure (see `reference.ts`); without it, the region statistics above.
   */
  grid?: LumaGrid;
  /** From `placeGhost`, in panel pixels. */
  placement: Placement;
  /** SPI tier. TRACE and QUIET draw a smudge (heavier blur). */
  tier?: Tier;
  /** Picks the variant (when `variant` is not given) and seeds the figure and the grain. */
  seed: number;
  /** Final state at once, no fade. On web `?static=1` sets it too. */
  static?: boolean;
  /** Linear fade of the ghost from 0 to full, in ms, when not static. Default 1500. */
  fadeInMs?: number;
  /** Draw the photo and grain only. On web `?ghost=0` sets it too (measurement harness). */
  disabled?: boolean;
  /** Apparition variant 0..5, or `'png'` for the v0 matte (`placement.matte`) as the figure. */
  variant?: number | 'png';
  /**
   * Jump-scare pop, 0..1 (`useScare`'s `pop`; null is off, 0 armed). At 1 the layer's stacked
   * peak alpha is raised to POP_ALPHA (0.30, a cap) and the clamp opens by POP_LIFT luma on a
   * linear curve (POP_GAMMA), so the hem's noise dissolve survives; the pop layer adds a 6 to 10 px
   * smear along the figure's motion. While armed (0) that layer is built, so the pop frame is ready.
   */
  pop?: number | null;
  testID?: string;
}

// The pop constants live in blend.ts (pure, unit-tested); re-exported here for the public API.
export { POP_ALPHA, POP_LIFT };

/** What the compositor drew, published on `window.__composite` under the web harness (`?static=1`). */
export interface CompositeInfo {
  placement: Placement;
  panel: { w: number; h: number };
  meanLuma: number;
  p80Luma: number;
  /** Clamp reference and occlusion threshold and ramp the compositor used (`reference.ts`). */
  clampRef: number;
  /**
   * Most a pixel may be lifted above `clampRef`, luma (CLAMP_LIFT, plus POP_LIFT on the pop frame;
   * NEAR_BLACK_LIFT on a near-black scene, which also caps the lift itself at that).
   */
  clampLift: number;
  /** Median luma under the figure and of the whole photo; true on the near-black smudge fallback. */
  median: number | null;
  sceneMedian: number | null;
  nearBlack: boolean;
  /** Grain amplitude after compositing (GRAIN, x NEAR_BLACK_GRAIN on a near-black scene). */
  grain: number;
  /** Highest effective ghost alpha the layer can reach on this frame (POP_ALPHA on the pop). */
  peakAlpha: number;
  occ: number;
  occRamp: number;
  /** Mean luma gradient under the figure, the synthesised mass (flat interiors) and the share of the figure cut. */
  gradient: number | null;
  band: Band | null;
  cut: number | null;
  variant: number | 'png';
  seed: number;
  tier?: Tier;
  pop: number;
}

declare global {
  // Read by scripts/measure-ghost.mjs (probe and result routes).
  var __composite: CompositeInfo | undefined;
}

type WebQuery = { off: boolean; isStatic: boolean; v1: boolean };

function webQuery(): WebQuery {
  const none: WebQuery = { off: false, isStatic: false, v1: false };
  if (Platform.OS !== 'web' || typeof window === 'undefined') return none;
  const q = new URLSearchParams(window.location?.search ?? '');
  return { off: q.get('ghost') === '0', isStatic: q.get('static') === '1', v1: q.get('v') === '1' };
}

/**
 * Harness switch for the result screen: true when the web URL carries `v=1`. Builder A reads it
 * to render `<Composite>` instead of `<GhostV0>` until v1 becomes the default.
 */
export function wantsCompositorV1(): boolean {
  return webQuery().v1;
}

function coverRect(img: SkImage | null, w: number, h: number): PhotoRect {
  if (!img) return { x: 0, y: 0, width: w, height: h };
  const s = Math.max(w / img.width(), h / img.height());
  const width = img.width() * s;
  const height = img.height() * s;
  return { x: (w - width) / 2, y: (h - height) / 2, width, height };
}

/** The blurred luma grid as an opaque grey image (luma in every channel), or a 1 x 1 stand-in. */
function gridImage(grid: LumaGrid | undefined): SkImage | null {
  const g = grid ? occlusionGrid(grid, OCC_GRID_BLUR) : { luma: new Uint8Array([0]), width: 1, height: 1 };
  const px = new Uint8Array(g.width * g.height * 4);
  for (let i = 0; i < g.luma.length; i++) {
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = g.luma[i]!;
    px[i * 4 + 3] = 255;
  }
  return Skia.Image.MakeImage({ width: g.width, height: g.height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque }, Skia.Data.fromBytes(px), g.width * 4);
}

/** Apparition image size for a figure box: device pixels, rounded up to 16 so sizes repeat (cache). */
function figureSize(p: Placement, scale: number): { width: number; height: number } {
  const r = (v: number) => Math.max(16, Math.ceil((v * scale) / 16) * 16);
  return { width: r(p.w / FIT_W), height: r(p.h / FIT_H) };
}

/**
 * Compositor v1: the photo and the apparition on one Skia canvas. The ghost layer (figure plus
 * 3 to 5 directional copies, Gaussian-blurred; the photo is not) goes through one runtime shader
 * that hides it where the scene is brighter than the region's 80th percentile (and, on a flat
 * interior, behind a soft synthesised foreground mass in the scene's colour), adds it with a
 * Plus blend (light only), clamps each pixel to the clamp reference + CLAMP_LIFT luma on a smooth curve, and adds 4% seeded grain
 * over the whole panel after compositing.
 */
export function Composite(props: CompositeProps) {
  const { width, height, tier: tierIn, seed, meanLuma, fadeInMs = 1500, testID = 'composite' } = props;
  const [query] = useState(webQuery);
  const isStatic = props.static || query.isStatic;
  const off = props.disabled || query.off;

  const uri = typeof props.photo === 'string' ? props.photo : null;
  const loaded = useImage(uri);
  const photo = typeof props.photo === 'string' ? loaded : props.photo;

  const png = props.variant === 'png';
  const matte = useImage(png ? MATTES[props.placement.matte] : null);
  const variant = typeof props.variant === 'number' ? props.variant : (seed >>> 0) % VARIANT_COUNT;

  const rect = props.photoRect ?? coverRect(photo, width, height);
  const { x: rx, y: ry, width: rw, height: rh } = rect;
  const { p80Luma, p90Luma, region, grid } = props;
  const given = props.placement;
  const ref = useMemo(
    () => reference({ meanLuma, p80Luma, p90Luma, region, grid, placement: given, photoRect: { x: rx, y: ry, width: rw, height: rh }, seed: seed >>> 0 }),
    [meanLuma, p80Luma, p90Luma, region, grid, given, rx, ry, rw, rh, seed],
  );
  // Near-black scene (D-023): the TRACE-style smudge, 0.7 scale at the lowest opacity band.
  const nearBlack = !!ref.nearBlack;
  const placement = useMemo(() => (nearBlack ? smudgePlacement(given) : given), [nearBlack, given]);
  const tier: Tier | undefined = nearBlack ? 'trace' : tierIn;

  const scale = Platform.OS === 'web' ? 1 : PixelRatio.get();
  const effect = useMemo(() => Skia.RuntimeEffect.Make(COMPOSITE_SKSL), []);
  const figure = useMemo<SkImage | null>(() => {
    if (png) return matte;
    return renderApparition({ variant, seed: seed >>> 0, ...figureSize(placement, scale) });
  }, [png, matte, variant, seed, placement, scale]);
  const ghost = useMemo(
    () => (figure ? buildGhostLayer({ figure, padded: !png, placement, width, height, scale, tier, seed: seed >>> 0, blur: nearBlack ? NEAR_BLACK_BLUR : 1 }) : null),
    [figure, png, placement, width, height, scale, tier, seed, nearBlack],
  );
  // The pop frame's layer (directional smear), built as soon as a scare is armed.
  const armed = props.pop !== null && props.pop !== undefined;
  const popGhost = useMemo(
    () => (armed && figure ? buildGhostLayer({ figure, padded: !png, placement, width, height, scale, tier, seed: seed >>> 0, pop: true, blur: nearBlack ? NEAR_BLACK_BLUR : 1 }) : null),
    [armed, figure, png, placement, width, height, scale, tier, seed, nearBlack],
  );

  const occl = useMemo(() => gridImage(props.grid), [props.grid]);
  const fade = useSharedValue(isStatic ? 1 : 0);
  useEffect(() => {
    if (isStatic) {
      fade.set(1);
      return;
    }
    fade.set(0);
    fade.set(withTiming(1, { duration: fadeInMs, easing: Easing.linear }));
  }, [fade, fadeInMs, isStatic, ghost]);

  const band = ref.band;
  const pop = Math.min(1, Math.max(0, props.pop ?? 0));
  // A near-black scene keeps its hard ceiling on the pop too.
  const clampLift = nearBlack ? NEAR_BLACK_LIFT : CLAMP_LIFT + pop * POP_LIFT;
  // In the compositor the near-black ceiling sits at NEAR_BLACK_CAP (under the published 18): the
  // glass over the panel adds a little to what the composite lifts.
  const limit = Math.min(255, ref.mean + (nearBlack ? NEAR_BLACK_CAP : clampLift)) / 255;
  const liftCap = nearBlack ? NEAR_BLACK_CAP / 255 : 1;
  const grain = GRAIN * (nearBlack ? NEAR_BLACK_GRAIN : 1);
  const occLo = Math.min(255, ref.occ) / 255;
  const occRamp = ref.ramp / 255;
  // The ghost layer's highest alpha: the figure under all its copies (and the echo).
  // On the near-black smudge the heavy blur spreads the layer to about NEAR_BLACK_PEAK of that
  // bound, so the clamp's reference peak follows it and the smudge's core reaches its ceiling.
  const peak = stackedAlpha(placement) * (nearBlack ? NEAR_BLACK_PEAK : 1);
  // On the pop frame the layer's stacked peak goes to POP_ALPHA, a cap (never above it), and the
  // clamp curve runs linear, so the hem keeps its dissolve.
  const gain = 1 + pop * (POP_ALPHA / Math.max(0.01, peak) - 1);
  const gammaK = GAMMA + pop * (POP_GAMMA - GAMMA);
  const on = off ? 0 : 1;
  // The smudge has no interior: no density patches on a near-black scene.
  const densAmt = nearBlack ? 0 : 1;
  const layer = pop > 0 && popGhost ? popGhost : ghost;
  const useGrid = props.grid && ref.source === 'figure' ? 1 : 0;
  // Synthetic foreground band on a flat scene (reference.ts); off otherwise.
  const bandU = useMemo(
    () => ({
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
    }),
    [band],
  );
  const uniforms = useDerivedValue(
    () => ({ useGrid, strength: on * gain * fade.get(), limit, liftCap, occLo, occRamp, grain, occRadius: OCC_RADIUS, gammaK, peak, densAmt, ...bandU }),
    [useGrid, on, gain, limit, liftCap, occLo, occRamp, grain, gammaK, peak, densAmt, bandU],
  );

  // Harness: publish what was drawn so scripts/measure-ghost.mjs can check the clamp and the box.
  const publish = query.isStatic && !off;
  const variantShown: number | 'png' = png ? 'png' : variant;
  useEffect(() => {
    if (!publish) return;
    globalThis.__composite = {
      placement,
      panel: { w: width, h: height },
      meanLuma,
      p80Luma: props.p80Luma ?? meanLuma,
      clampRef: ref.mean,
      clampLift,
      median: ref.median ?? null,
      sceneMedian: ref.sceneMedian ?? null,
      nearBlack,
      grain,
      peakAlpha: peak * gain,
      occ: ref.occ,
      occRamp: ref.ramp,
      gradient: ref.gradient ?? null,
      band,
      cut: ref.cut ?? null,
      variant: variantShown,
      seed: seed >>> 0,
      tier,
      pop,
    };
  }, [publish, placement, width, height, meanLuma, props.p80Luma, ref.mean, clampLift, ref.median, ref.sceneMedian, nearBlack, grain, peak, gain, ref.occ, ref.ramp, ref.gradient, band, ref.cut, variantShown, seed, tier, pop]);

  if (!effect) throw new Error('Composite: shader failed to compile');
  const ready = !!photo && !!layer && !!occl;

  return (
    <View testID={ready ? testID : undefined} pointerEvents="none" style={{ width, height }}>
      {ready ? (
        <SnapshotCanvas style={{ width, height }}>
          <Rect x={0} y={0} width={width} height={height}>
            <Shader source={effect} uniforms={uniforms}>
              <ImageShader image={photo} fit="fill" rect={rect} tx="clamp" ty="clamp" />
              <ImageShader image={layer} fit="fill" rect={{ x: 0, y: 0, width, height }} tx="decal" ty="decal" />
              <FractalNoise freqX={GRAIN_FREQ} freqY={GRAIN_FREQ} octaves={2} seed={(seed >>> 0) % 1000} />
              {occl ? <ImageShader image={occl} fit="fill" rect={rect} tx="clamp" ty="clamp" /> : null}
            </Shader>
          </Rect>
        </SnapshotCanvas>
      ) : null}
    </View>
  );
}
