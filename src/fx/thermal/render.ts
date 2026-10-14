/**
 * The offscreen pass: field bytes to a sensor-sized PH-WHT image (160 x 120 or 120 x 160). The
 * view then upscales it with nearest-neighbour sampling, so each sensor pixel stays a hard block.
 * Call only after Skia is ready (on web, after CanvasKit loads), never at module load.
 */
import { AlphaType, ColorType, FilterMode, MipmapMode, Skia, TileMode, type SkImage, type SkRuntimeEffect } from '@shopify/react-native-skia';

import { encodeField } from './encode';
import { lutUniforms, PH_WHT_SKSL } from './palette';
import type { ThermalField } from './thermalField';

export function makeLutEffect(): SkRuntimeEffect {
  const fx = Skia.RuntimeEffect.Make(PH_WHT_SKSL);
  if (!fx) throw new Error('thermal: PH-WHT shader failed to compile');
  return fx;
}

/** Field (plus optional live shimmer frame) to a PH-WHT image at sensor size, or null on failure. */
export function renderThermalImage(field: ThermalField, effect: SkRuntimeEffect, frame = 0): SkImage | null {
  const { width: w, height: h } = field;
  const bytes = encodeField(field, frame);
  const src = Skia.Image.MakeImage(
    { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque },
    Skia.Data.fromBytes(bytes),
    w * 4,
  );
  if (!src) return null;
  // CPU raster surface: the pass is 19 200 pixels, cheaper than a GPU round trip on both backends.
  const surface = Skia.Surface.Make(w, h);
  if (!surface) return null;
  const paint = Skia.Paint();
  paint.setShader(
    effect.makeShaderWithChildren(lutUniforms(), [
      src.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Nearest, MipmapMode.None),
    ]),
  );
  surface.getCanvas().drawRect(Skia.XYWHRect(0, 0, w, h), paint);
  surface.flush();
  const out = surface.makeImageSnapshot().makeNonTextureImage() ?? null;
  src.dispose();
  surface.dispose();
  return out;
}
