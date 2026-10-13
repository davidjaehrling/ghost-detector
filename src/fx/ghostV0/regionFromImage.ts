import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { REGION_GRID, regionFromJpegBase64, type RegionResult } from './regionFromPixels';

export type { RegionResult } from './regionFromPixels';

/**
 * Native: expo-image-manipulator shrinks the photo to 96 px on the long side and hands back a
 * base64 JPEG; jpeg-js decodes it in JS; then the same `downsampleLuma` + `findDarkRegion` path
 * as the web build. No Skia needed. Returns null if the image cannot be read.
 * The web build uses `regionFromImage.web.ts`.
 */
export async function regionFromImage(uri: string): Promise<RegionResult | null> {
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
    return regionFromJpegBase64(saved.base64);
  } catch {
    return null;
  } finally {
    for (const r of refs) r.release();
  }
}
