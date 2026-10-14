import { downsampleLuma } from '../../engine';
import { REGION_GRID, regionFromRgba } from '../ghostV0/regionFromPixels';
import type { ThermalSource } from './lumaFromImage';

export type { ThermalSource } from './lumaFromImage';

/** Long side of the canvas read back (as `regionFromImage.web.ts`). */
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
 * Web: decode into a 2D canvas, read RGBA once, and derive both the 96 px luma grid and the dark
 * region from the same pixels (`regionFromRgba` from ghostV0). Null if the image cannot be read.
 */
export async function lumaFromImage(uri: string): Promise<ThermalSource | null> {
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
    const rgba = ctx.getImageData(0, 0, w, h).data;
    return { grid: downsampleLuma(rgba, w, h, REGION_GRID), region: regionFromRgba(rgba, w, h).region };
  } catch {
    return null;
  }
}
