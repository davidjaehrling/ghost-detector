import type { DarkRegion } from '../../engine';

export interface RegionResult {
  /** Darkest usable region, or null when the frame is too bright for one. */
  region: DarkRegion | null;
  /** Mean luma 0..255 of the region, or of the whole frame when `region` is null. */
  meanLuma: number;
}

/**
 * Native stub. React Native has no pixel access to an image without a native module.
 * Native pixel access arrives in P3 with Skia: `Skia.Image.MakeImageFromEncoded` then
 * `makeNonTextureImage` / `readPixels` (or `makeRasterImage`), fed to `downsampleLuma` and
 * `findDarkRegion`. Until then callers get null and `placeGhost(null, ...)` uses its
 * lower-third fallback. The web build uses `regionFromImage.web.ts`.
 */
export async function regionFromImage(_uri: string): Promise<RegionResult | null> {
  return null;
}
