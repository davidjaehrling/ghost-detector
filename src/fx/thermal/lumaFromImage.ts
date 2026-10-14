import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';

import { downsampleLuma, type DarkRegion } from '../../engine';
import { base64ToBytes, REGION_GRID, regionFromRgba } from '../ghostV0/regionFromPixels';
import type { LumaGrid } from './thermalField';

export interface ThermalSource {
  /** 96 px luma grid (`downsampleLuma`). */
  grid: LumaGrid;
  /** Engine dark region of the same pixels, or null. */
  region: DarkRegion | null;
}

/**
 * Native: the same route as ghostV0's `regionFromImage` (expo-image-manipulator to 96 px, base64
 * JPEG, jpeg-js), keeping the luma grid as well as the region. The web build uses
 * `lumaFromImage.web.ts`. Unverified on a device so far (L3).
 */
export async function lumaFromImage(uri: string): Promise<ThermalSource | null> {
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
    if (!img.width || !img.height) return null;
    const rgba = new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.length);
    return { grid: downsampleLuma(rgba, img.width, img.height, REGION_GRID), region: regionFromRgba(rgba, img.width, img.height).region };
  } catch {
    return null;
  } finally {
    for (const r of refs) r.release();
  }
}
