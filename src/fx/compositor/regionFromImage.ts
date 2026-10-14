import { AlphaType, ColorType, FilterMode, MipmapMode, Skia, type SkImage } from '@shopify/react-native-skia';

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';

import { base64ToBytes } from '../ghostV0/regionFromPixels';
import { halvingSteps, REGION_GRID, statsFromRgba, type RegionStats } from './regionStats';

export type { RegionStats } from './regionStats';

/** Halve `img` on raster surfaces until the long side is at most 192 px; returns the last image. */
function shrink(img: SkImage): SkImage | null {
  let cur = img;
  for (const { w, h } of halvingSteps(img.width(), img.height())) {
    const surface = Skia.Surface.Make(w, h);
    if (!surface) return null;
    const c = surface.getCanvas();
    c.drawImageRectOptions(cur, Skia.XYWHRect(0, 0, cur.width(), cur.height()), Skia.XYWHRect(0, 0, w, h), FilterMode.Linear, MipmapMode.None);
    surface.flush();
    cur = surface.makeImageSnapshot();
  }
  return cur.makeNonTextureImage() ?? cur;
}

/** The v0 path: expo-image-manipulator to 96 px, base64 JPEG, jpeg-js, then the shared stats. */
async function regionFromJpeg(uri: string): Promise<RegionStats | null> {
  const refs: { release(): void }[] = [];
  try {
    const full = await ImageManipulator.manipulate(uri).renderAsync();
    refs.push(full);
    const portrait = full.height >= full.width;
    const small = await ImageManipulator.manipulate(full)
      .resize(portrait ? { height: REGION_GRID } : { width: REGION_GRID })
      .renderAsync();
    refs.push(small);
    const saved = await small.saveAsync({ base64: true, format: SaveFormat.JPEG, compress: 0.9 });
    if (!saved.base64) return null;
    const img = decode(base64ToBytes(saved.base64), { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 4 });
    return img.width && img.height ? statsFromRgba(img.data, img.width, img.height) : null;
  } catch {
    return null;
  } finally {
    for (const r of refs) r.release();
  }
}

/**
 * Native: decode with Skia (`Skia.Data.fromURI` + `MakeImageFromEncoded`), halve on CPU raster
 * surfaces to at most 192 px, `readPixels` as RGBA, then the shared `statsFromRgba` (96 px grid).
 * Falls back to the v0 path (expo-image-manipulator + jpeg-js, same stats) when Skia cannot
 * read the image. UNVERIFIED on a device. The web build uses `regionFromImage.web.ts`.
 */
export async function regionFromImage(uri: string): Promise<RegionStats | null> {
  try {
    const data = await Skia.Data.fromURI(uri);
    const img = Skia.Image.MakeImageFromEncoded(data);
    const small = img ? shrink(img) : null;
    if (small) {
      const w = small.width();
      const h = small.height();
      const px = small.readPixels(0, 0, { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
      if (px instanceof Uint8Array && px.length >= w * h * 4) return statsFromRgba(px, w, h);
    }
  } catch {
    // fall through to the jpeg-js path
  }
  return regionFromJpeg(uri);
}
