import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia';

import { statsFromRgba, type RegionStats } from '../compositor/regionStats';

/** Long side the photo is read at, as the web `regionFromImage` does before `statsFromRgba`. */
const READ_SIZE = 384;

/** The compositor's region statistics from a decoded image (Skia raster read). Null if unreadable. */
export function statsFromImage(img: SkImage): RegionStats | null {
  const s = Math.min(1, READ_SIZE / Math.max(img.width(), img.height()));
  const w = Math.max(1, Math.round(img.width() * s));
  const h = Math.max(1, Math.round(img.height() * s));
  const surface = Skia.Surface.Make(w, h);
  if (!surface) return null;
  const p = Skia.Paint();
  surface.getCanvas().drawImageRect(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(0, 0, w, h), p);
  surface.flush();
  const px = surface.makeImageSnapshot().readPixels(0, 0, { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  if (!px) return null;
  return statsFromRgba(px as Uint8Array, w, h);
}
