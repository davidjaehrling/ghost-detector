/**
 * The ghost layer: the apparition (or a v0 PNG matte) drawn at the `placeGhost` box with its
 * directional offset copies (`motion.ts`), the CRITICAL echo, and a one-sided vertical smear of
 * 6 to 10 px on every copy, then Gaussian-blurred as one layer. The scene is not
 * blurred, so the ghost is always softer than the photo.
 */
import { BlendMode, Skia, TileMode, type SkImage } from '@shopify/react-native-skia';

import type { Tier } from '../../engine';
import { makeSurface, snapshot } from '../apparition/render';
import { imageRectFor } from '../apparition/shape';
import type { Placement } from '../ghostV0/placement';
import { ghostBlurSigma, layerCopies, smearFor } from './motion';

export interface GhostLayerInput {
  /** The figure: white with alpha (apparition) or a v0 matte. */
  figure: SkImage;
  /**
   * True for an apparition image, whose silhouette fills only the centre of the image (`FIT_W` x
   * `FIT_H`): it is drawn larger so the silhouette fills the placement box and the feather spills
   * past it. A v0 matte is already cropped to the figure and is drawn at the box.
   */
  padded?: boolean;
  placement: Placement;
  /** Panel size in layout pixels. */
  width: number;
  height: number;
  /** Device pixels per layout pixel for the layer image. */
  scale: number;
  tier?: Tier;
  /** Seeds the vertical smear (length and direction). */
  seed?: number;
}

/** Draw the layer offscreen. Returns a raster image of the panel size times `scale`, or null. */
export function buildGhostLayer({ figure, padded = true, placement, width, height, scale, tier, seed = 0 }: GhostLayerInput): SkImage | null {
  const W = Math.max(1, Math.round(width * scale));
  const H = Math.max(1, Math.round(height * scale));
  const surface = makeSurface(W, H);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('transparent'));
  canvas.save();
  canvas.scale(scale, scale);
  const sigma = ghostBlurSigma(placement.w, tier) * scale;
  const layer = Skia.Paint();
  layer.setImageFilter(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Decal));
  canvas.saveLayer(layer);
  const src = Skia.XYWHRect(0, 0, figure.width(), figure.height());
  const { opacity, flipX } = placement;
  const { x, y, w, h } = padded ? imageRectFor(placement) : placement;
  const smear = smearFor(seed);
  // Farthest copy first so the main figure lands on top (normal "over" inside the layer). The
  // CRITICAL echo goes under everything.
  const layers = layerCopies(placement);
  const layerPaint = Skia.Paint();
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setBlendMode(BlendMode.Plus);
  for (const c of layers) {
    // Each copy is its own layer at the copy's alpha; inside it the figure is smeared vertically
    // (Plus with weights summing to 1, so the smear spreads alpha without adding any).
    layerPaint.setAlphaf(Math.min(1, opacity * c.alpha));
    canvas.saveLayer(layerPaint);
    for (let k = 0; k < smear.offsets.length; k++) {
      paint.setAlphaf(smear.weights[k]!);
      canvas.save();
      if (flipX) {
        const cx = x + c.dx + w / 2;
        canvas.translate(cx, 0);
        canvas.scale(-1, 1);
        canvas.translate(-cx, 0);
      }
      canvas.drawImageRect(figure, src, Skia.XYWHRect(x + c.dx, y + c.dy + smear.offsets[k]!, w, h), paint);
      canvas.restore();
    }
    canvas.restore();
  }
  canvas.restore(); // blur layer
  canvas.restore(); // scale
  return snapshot(surface);
}
