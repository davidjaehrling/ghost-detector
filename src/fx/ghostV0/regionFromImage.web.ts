import { downsampleLuma, findDarkRegion } from '../../engine';
import type { RegionResult } from './regionFromImage';

export type { RegionResult } from './regionFromImage';

/** Long side of the canvas we read back. `downsampleLuma` then takes it to 96. */
const READ_SIZE = 384;
const TARGET = 96;

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
 * Web: decode into a canvas, read RGBA, downsample to luma and run the engine's region finder.
 * Returns null if the image cannot be loaded or read (for example a tainted cross-origin canvas).
 */
export async function regionFromImage(uri: string): Promise<RegionResult | null> {
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
    const { data } = ctx.getImageData(0, 0, w, h);
    const { luma, width, height } = downsampleLuma(data, w, h, TARGET);
    const region = findDarkRegion(luma, width, height);
    if (region) return { region, meanLuma: region.meanLuma };
    let sum = 0;
    for (let i = 0; i < luma.length; i++) sum += luma[i]!;
    return { region: null, meanLuma: sum / Math.max(1, luma.length) };
  } catch {
    return null;
  }
}
