import { FilterMode, MipmapMode, processUniforms, Skia, TileMode, type SkCanvas, type SkImage, type SkRuntimeEffect, type SkShader } from '@shopify/react-native-skia';

import type { Tier } from '../../engine';
import { renderApparition, VARIANT_COUNT } from '../apparition';
import type { Placement, RegionInput } from '../ghostV0/placement';
import { COMPOSITE_SKSL } from './blend';
import { buildGhostLayer } from './ghostLayer';
import type { LumaGrid } from './regionStats';
import { compositeSetup, compositeUniforms, coverRect, figureSize, GRAIN_FREQ, gridImage, type CompositeSetup, type PhotoRect } from './setup';

// The compositor drawn straight onto a canvas, with no React tree: the same set-up, ghost layer,
// shader and uniforms as <Composite> in its final state (fade 1, no pop). The share card uses it;
// it always works in layout pixels at scale 1 (the caller picks the resolution), so the output
// does not depend on the device's pixel ratio.

export interface OffscreenCompositeInput {
  photo: SkImage;
  /** Panel size in pixels (the canvas area drawn, from 0,0). */
  width: number;
  height: number;
  photoRect?: PhotoRect;
  region?: RegionInput | null;
  meanLuma: number;
  p80Luma?: number;
  p90Luma?: number;
  grid?: LumaGrid;
  placement: Placement;
  tier?: Tier;
  seed: number;
  variant?: number;
  /** Photo and grain only (no figure). */
  disabled?: boolean;
  /** Grain amplitude override (0 lets the caller add the grain after its own overlays). */
  grain?: number;
  /** Grain FractalNoise frequency per pixel. Default GRAIN_FREQ (0.9). */
  grainFreq?: number;
}

let effect: SkRuntimeEffect | null = null;
function compositeEffect(): SkRuntimeEffect {
  effect ??= Skia.RuntimeEffect.Make(COMPOSITE_SKSL);
  if (!effect) throw new Error('compositor: shader failed to compile');
  return effect;
}

/** An image as a shader drawn into `rect` (fit fill), as the declarative ImageShader does it. */
export function imageShader(img: SkImage, rect: PhotoRect, tile: TileMode): SkShader {
  const m = Skia.Matrix();
  m.translate(rect.x, rect.y);
  m.scale(rect.width / img.width(), rect.height / img.height());
  return img.makeShaderOptions(tile, tile, FilterMode.Linear, MipmapMode.None, m);
}

/** Draws the composite at 0,0 on `canvas`. Returns the set-up it used, or null if the ghost layer could not be built. */
export function drawComposite(canvas: SkCanvas, i: OffscreenCompositeInput): CompositeSetup | null {
  const { width, height, seed } = i;
  const rect = i.photoRect ?? coverRect(i.photo, width, height);
  const setup = compositeSetup({ photoRect: rect, region: i.region, meanLuma: i.meanLuma, p80Luma: i.p80Luma, p90Luma: i.p90Luma, grid: i.grid, placement: i.placement, tier: i.tier, seed });
  const variant = i.variant ?? (seed >>> 0) % VARIANT_COUNT;
  const figure = i.disabled ? null : renderApparition({ variant, seed: seed >>> 0, ...figureSize(setup.placement, 1) });
  const layer = figure
    ? buildGhostLayer({ figure, padded: true, placement: setup.placement, width, height, scale: 1, tier: setup.tier, seed: seed >>> 0, blur: setup.blur })
    : null;
  if (!i.disabled && !layer) return null;
  const occl = gridImage(i.grid);
  const fx = compositeEffect();
  const u = compositeUniforms(setup, { pop: 0, on: layer ? 1 : 0, useGrid: !!i.grid, grain: i.grain });
  const freq = i.grainFreq ?? GRAIN_FREQ;
  const children = [
    imageShader(i.photo, rect, TileMode.Clamp),
    layer ? imageShader(layer, { x: 0, y: 0, width, height }, TileMode.Decal) : Skia.Shader.MakeColor(Skia.Color('transparent')),
    // With the grain held back (0) the noise is never needed: a flat 0.5 grey costs nothing per pixel.
    u.values.grain > 0 ? Skia.Shader.MakeFractalNoise(freq, freq, 2, (seed >>> 0) % 1000, 0, 0) : Skia.Shader.MakeColor(Skia.Color('#808080')),
    occl ? imageShader(occl, rect, TileMode.Clamp) : Skia.Shader.MakeColor(Skia.Color('black')),
  ];
  const paint = Skia.Paint();
  paint.setShader(fx.makeShaderWithChildren(processUniforms(fx, u.values), children));
  canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paint);
  return setup;
}
