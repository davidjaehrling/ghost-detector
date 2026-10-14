import { statsFromRgba, type RegionStats } from './regionStats';

export type { RegionStats } from './regionStats';

/** Long side of the canvas we read back; `statsFromRgba` then takes it to 96. */
const READ_SIZE = 384;

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${uri}`));
    img.src = uri;
  });
}

/**
 * Web: the 2D canvas path from v0 (decode, draw at 384 px, `getImageData`), then the shared
 * `statsFromRgba`. This reads the photo, never the Skia canvas. Null if the image cannot be read.
 */
export async function regionFromImage(uri: string): Promise<RegionStats | null> {
  try {
    const img = await loadImage(uri);
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    if (!iw || !ih) return null;
    const scale = Math.min(1, READ_SIZE / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * scale));
    const h = Math.max(1, Math.round(ih * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return statsFromRgba(ctx.getImageData(0, 0, w, h).data, w, h);
  } catch {
    return null;
  }
}
