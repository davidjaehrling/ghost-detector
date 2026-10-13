import { Canvas, FractalNoise, ImageShader, Rect, Shader, Skia, useImage, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { PixelRatio, Platform, View } from 'react-native';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import type { Tier } from '../../engine';
import { FIT_H, FIT_W, renderApparition, VARIANT_COUNT } from '../apparition';
import type { Placement, RegionInput } from '../ghostV0/placement';
import { CLAMP_LIFT, COMPOSITE_SKSL, GRAIN, KNEE, OCC_RAMP } from './blend';
import { buildGhostLayer } from './ghostLayer';
import { reference } from './reference';
import type { LumaGrid } from './regionStats';

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
  /** Region mean luma 0..255 (`regionFromImage`). The ghost never lifts a pixel above mean + 24. */
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
  testID?: string;
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

/** Apparition image size for a figure box: device pixels, rounded up to 16 so sizes repeat (cache). */
function figureSize(p: Placement, scale: number): { width: number; height: number } {
  const r = (v: number) => Math.max(16, Math.ceil((v * scale) / 16) * 16);
  return { width: r(p.w / FIT_W), height: r(p.h / FIT_H) };
}

/**
 * Compositor v1: the photo and the apparition on one Skia canvas. The ghost layer (figure plus
 * 3 to 5 directional copies, Gaussian-blurred; the photo is not) goes through one runtime shader
 * that hides it where the scene is brighter than the region's 80th percentile, adds it with a
 * Plus blend (light only), soft-clamps each pixel to the region mean + 24 luma, and adds 4% seeded grain
 * over the whole panel after compositing.
 */
export function Composite(props: CompositeProps) {
  const { width, height, placement, tier, seed, meanLuma, fadeInMs = 1500, testID = 'composite' } = props;
  const [query] = useState(webQuery);
  const isStatic = props.static || query.isStatic;
  const off = props.disabled || query.off;

  const uri = typeof props.photo === 'string' ? props.photo : null;
  const loaded = useImage(uri);
  const photo = typeof props.photo === 'string' ? loaded : props.photo;

  const png = props.variant === 'png';
  const matte = useImage(png ? MATTES[placement.matte] : null);
  const variant = typeof props.variant === 'number' ? props.variant : (seed >>> 0) % VARIANT_COUNT;

  const scale = Platform.OS === 'web' ? 1 : PixelRatio.get();
  const effect = useMemo(() => Skia.RuntimeEffect.Make(COMPOSITE_SKSL), []);
  const figure = useMemo<SkImage | null>(() => {
    if (png) return matte;
    return renderApparition({ variant, seed: seed >>> 0, ...figureSize(placement, scale) });
  }, [png, matte, variant, seed, placement, scale]);
  const ghost = useMemo(
    () => (figure ? buildGhostLayer({ figure, padded: !png, placement, width, height, scale, tier }) : null),
    [figure, png, placement, width, height, scale, tier],
  );

  const fade = useSharedValue(isStatic ? 1 : 0);
  useEffect(() => {
    if (isStatic) {
      fade.value = 1;
      return;
    }
    fade.value = 0;
    fade.value = withTiming(1, { duration: fadeInMs, easing: Easing.linear });
  }, [fade, fadeInMs, isStatic, ghost]);

  const rect = props.photoRect ?? coverRect(photo, width, height);
  const ref = reference({ meanLuma, p80Luma: props.p80Luma, p90Luma: props.p90Luma, region: props.region, grid: props.grid, placement, photoRect: rect });
  const limit = Math.min(255, ref.mean + CLAMP_LIFT) / 255;
  const occLo = Math.min(255, ref.occ) / 255;
  const on = off ? 0 : 1;
  const uniforms = useDerivedValue(
    () => ({ strength: on * fade.value, limit, occLo, occRamp: OCC_RAMP / 255, grain: GRAIN, occRadius: OCC_RADIUS, knee: KNEE }),
    [on, limit, occLo],
  );

  if (!effect) throw new Error('Composite: shader failed to compile');
  const ready = !!photo && !!ghost;

  return (
    <View testID={ready ? testID : undefined} pointerEvents="none" style={{ width, height }}>
      {ready ? (
        <Canvas style={{ width, height }}>
          <Rect x={0} y={0} width={width} height={height}>
            <Shader source={effect} uniforms={uniforms}>
              <ImageShader image={photo} fit="fill" rect={rect} tx="clamp" ty="clamp" />
              <ImageShader image={ghost} fit="fill" rect={{ x: 0, y: 0, width, height }} tx="decal" ty="decal" />
              <FractalNoise freqX={GRAIN_FREQ} freqY={GRAIN_FREQ} octaves={2} seed={(seed >>> 0) % 1000} />
            </Shader>
          </Rect>
        </Canvas>
      ) : null}
    </View>
  );
}
