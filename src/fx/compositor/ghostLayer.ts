/**
 * The ghost layer: the apparition (or a v0 PNG matte) drawn at the `placeGhost` box with its
 * directional offset copies (`motion.ts`), the CRITICAL echo, and a one-sided vertical smear of
 * 6 to 10 px on every copy, then Gaussian-blurred as one layer. The scene is not
 * blurred, so the ghost is always softer than the photo. On the jump-scare pop frame (`pop`) each
 * copy is also smeared 6 to 10 px along the figure's motion (`popSmearFor`), so the pop reads as
 * movement; the figure keeps its noise-dissolved hem (the same apparition image).
 */
import { BlendMode, FilterMode, MipmapMode, Skia, TileMode, type SkCanvas, type SkImage, type SkRuntimeEffect } from '@shopify/react-native-skia';

import type { Tier } from '../../engine';
import { Bin } from '../bin';
import { makeSurface, snapshotFree } from '../apparition/render';
import { imageRectFor } from '../apparition/shape';
import { RAG_CORE, RAG_CYCLES, RAG_DISPLACE, RAG_EDGES, RAG_ERODE, RAG_STRETCH } from '../apparition/metrics';
import { stackedAlpha, type Placement } from '../ghostV0/placement';
import { ghostBlurSigma, layerCopies, popSmearFor, smearFor } from './motion';

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
  /** Seeds the vertical smear (length and direction) and the pop smear. */
  seed?: number;
  /** The jump-scare pop frame's layer: adds the directional smear. */
  pop?: boolean;
  /** Extra factor on the layer's blur (the near-black smudge, D-023). Default 1. */
  blur?: number;
}

/**
 * The pop frame's dissolve (D-023): the variants' ragged-edge pass (`render.ts`, the same
 * FractalNoise displacement and edge bite and the same constants) run again on the smeared layer,
 * so the smear never rounds the outline and hem into a smooth or regular edge. `peak` is the
 * layer's highest alpha (the bite works on alpha relative to it). Twin of `popFrameGrid`'s pass.
 */
const POP_RAG_SKSL = `
uniform shader layer;
uniform shader nDisp;
uniform shader nRag;
uniform float disp;
uniform float peak;
uniform float erode;
uniform float ragE0;
uniform float ragE1;
uniform float core0;
uniform float core1;
float unp(half4 n) { return n.a > 0.0 ? n.r / n.a : 0.5; }
float unpG(half4 n) { return n.a > 0.0 ? n.g / n.a : 0.5; }
float ro(float n) { return clamp((n - 0.5) * 2.5, -1.0, 1.0); }
half4 main(float2 xy) {
  half4 dn = nDisp.eval(xy);
  half4 c = layer.eval(xy + float2(ro(unp(dn)), ro(unpG(dn))) * disp);
  float a = float(c.a) / peak;
  float bite = smoothstep(ragE0, ragE1, unp(nRag.eval(xy))) * (1.0 - smoothstep(core0, core1, a));
  float t = min(0.95, erode * bite);
  float e = clamp((a - t) / max(1.0 - t, 0.001), 0.0, 1.0) * peak;
  float dens = c.a > 0.0001 ? clamp(float(c.r) / float(c.a), 0.0, 1.0) : 1.0;
  return half4(half3(dens * e), half(e));
}`;

let popRag: SkRuntimeEffect | null = null;

/** Draw the layer offscreen. Returns a raster image of the panel size times `scale`, or null. */
export function buildGhostLayer({ figure, padded = true, placement, width, height, scale, tier, seed = 0, pop = false, blur = 1 }: GhostLayerInput): SkImage | null {
  const W = Math.max(1, Math.round(width * scale));
  const H = Math.max(1, Math.round(height * scale));
  const surface = makeSurface(W, H);
  if (!surface) return null;
  // The paints and filters below are freed once the layer is snapshot (CanvasKit's wasm heap has no GC).
  const bin = new Bin();
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('transparent'));
  canvas.save();
  canvas.scale(scale, scale);
  const sigma = ghostBlurSigma(placement.w, tier) * blur * scale;
  const layer = bin.own(Skia.Paint());
  layer.setImageFilter(bin.own(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Decal)));
  canvas.saveLayer(layer);
  const src = Skia.XYWHRect(0, 0, figure.width(), figure.height());
  const { opacity, flipX } = placement;
  const { x, y, w, h } = padded ? imageRectFor(placement) : placement;
  const smear = smearFor(seed);
  // Every sample of the vertical smear times every sample of the pop's directional smear (one
  // sample at 0 off the pop); the weights multiply, so they still sum to 1.
  const dir = pop ? popSmearFor(seed, placement) : { offsets: [[0, 0]] as [number, number][], weights: [1] };
  const taps: { dx: number; dy: number; w: number }[] = [];
  for (let k = 0; k < smear.offsets.length; k++)
    for (let j = 0; j < dir.offsets.length; j++) taps.push({ dx: dir.offsets[j]![0], dy: smear.offsets[k]! + dir.offsets[j]![1], w: smear.weights[k]! * dir.weights[j]! });
  // Farthest copy first so the main figure lands on top (normal "over" inside the layer). The
  // CRITICAL echo goes under everything.
  const layers = layerCopies(placement);
  const drawCopies = (cv: SkCanvas) => {
    const layerPaint = bin.own(Skia.Paint());
    const paint = bin.own(Skia.Paint());
    paint.setAntiAlias(true);
    paint.setBlendMode(BlendMode.Plus);
    for (const c of layers) {
      // Each copy is its own layer at the copy's alpha; inside it the figure is smeared
      // (Plus with weights summing to 1, so the smear spreads alpha without adding any).
      layerPaint.setAlphaf(Math.min(1, opacity * c.alpha));
      cv.saveLayer(layerPaint);
      for (const tap of taps) {
        paint.setAlphaf(tap.w);
        cv.save();
        if (flipX) {
          const cx = x + c.dx + tap.dx + w / 2;
          cv.translate(cx, 0);
          cv.scale(-1, 1);
          cv.translate(-cx, 0);
        }
        cv.drawImageRect(figure, src, Skia.XYWHRect(x + c.dx + tap.dx, y + c.dy + tap.dy, w, h), paint);
        cv.restore();
      }
      cv.restore();
    }
  };
  const ragged = pop ? popDissolve(drawCopies, W, H, scale, w * scale, Math.min(1, stackedAlpha(placement)), seed) : null;
  if (ragged) canvas.drawImageRect(ragged, Skia.XYWHRect(0, 0, W, H), Skia.XYWHRect(0, 0, width, height), bin.own(Skia.Paint()));
  else drawCopies(canvas);
  canvas.restore(); // blur layer
  canvas.restore(); // scale
  ragged?.dispose();
  const out = snapshotFree(surface);
  bin.free();
  return out;
}

/** The pop's smeared copies through POP_RAG_SKSL, device pixels. `imgW` is the figure image width (px). */
function popDissolve(drawCopies: (cv: SkCanvas) => void, W: number, H: number, scale: number, imgW: number, peak: number, seed: number): SkImage | null {
  const a = makeSurface(W, H);
  const b = makeSurface(W, H);
  popRag ??= Skia.RuntimeEffect.Make(POP_RAG_SKSL);
  if (!a || !b || !popRag) {
    a?.dispose();
    b?.dispose();
    return null;
  }
  const bin = new Bin();
  const ca = a.getCanvas();
  ca.clear(Skia.Color('transparent'));
  ca.save();
  ca.scale(scale, scale);
  drawCopies(ca);
  ca.restore();
  const smeared = snapshotFree(a);
  const s = (seed % 9973) * 23 + 5;
  const nDisp = bin.own(Skia.Shader.MakeFractalNoise(RAG_CYCLES / imgW, RAG_CYCLES / imgW, 2, s, 0, 0));
  const nRag = bin.own(Skia.Shader.MakeFractalNoise(RAG_CYCLES / imgW, (RAG_CYCLES * RAG_STRETCH) / imgW, 2, s + 1, 0, 0));
  const shader = bin.own(
    popRag.makeShaderWithChildren(
      [RAG_DISPLACE * 0.5 * imgW, Math.max(1e-3, peak), RAG_ERODE, RAG_EDGES[0], RAG_EDGES[1], RAG_CORE[0], RAG_CORE[1]],
      [bin.own(smeared.makeShaderOptions(TileMode.Decal, TileMode.Decal, FilterMode.Linear, MipmapMode.None)), nDisp, nRag],
    ),
  );
  const cb = b.getCanvas();
  cb.clear(Skia.Color('transparent'));
  const fill = bin.own(Skia.Paint());
  fill.setShader(shader);
  cb.drawRect(Skia.XYWHRect(0, 0, W, H), fill);
  const out = snapshotFree(b);
  bin.free();
  smeared.dispose();
  return out;
}
