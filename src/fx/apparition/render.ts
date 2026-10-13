/**
 * Skia side of the apparition library: the `shape.ts` polygons drawn into an offscreen surface,
 * displaced by FractalNoise, feathered, and cut by the same noise alpha mask that `metrics.ts`
 * reproduces in TS. Call only after Skia is ready (on web, after CanvasKit loads): nothing here
 * touches the Skia API at module load.
 */
import {
  BlendMode,
  ColorChannel,
  FilterMode,
  MipmapMode,
  Skia,
  TileMode,
  type SkImage,
  type SkPath,
  type SkRuntimeEffect,
  type SkSurface,
} from '@shopify/react-native-skia';
import { Platform } from 'react-native';

import { DENSITY_CYCLES, DENSITY_CYCLES_X, DENSITY_EDGES, DENSITY_FLOOR, INTERIOR, LATERAL_EDGES, NOISE_CYCLES } from './metrics';
import { buildSilhouette, type Pt, type Silhouette } from './shape';

/**
 * Noise alpha mask, the SkSL twin of `maskAlpha` in `metrics.ts` (whose alpha is this pass's alpha
 * times its grey). Output is premultiplied: alpha the figure, grey/alpha its interior density.
 */
const MASK_SKSL = `
uniform shader shape;
uniform shader nEdge;
uniform shader nDen;
uniform shader nLow;
uniform float erode;
uniform float floorD;
uniform float hemFade;
uniform float hemFrom;
uniform float hemTo;
uniform float boxH;
uniform float lowFloor;
uniform float lowE0;
uniform float lowE1;
uniform float boxW;
uniform float lateral;
uniform float lateralSide;
uniform float latE0;
uniform float latE1;
uniform float in0;
uniform float in1;
float unp(half4 n) { return n.a > 0.0 ? n.r / n.a : 0.5; }
half4 main(float2 xy) {
  float a = shape.eval(xy).a;
  float t = erode * unp(nEdge.eval(xy));
  float e = clamp((a - t) / max(1.0 - t, 0.001), 0.0, 1.0);
  float d = floorD + (1.0 - floorD) * unp(nDen.eval(xy));
  float low = lowFloor + (1.0 - lowFloor) * smoothstep(lowE0, lowE1, unp(nLow.eval(xy)));
  float fade = 1.0 - (1.0 - hemFade) * smoothstep(hemFrom, hemTo, xy.y / boxH);
  float u = xy.x / boxW;
  float lat = 1.0 - lateral * smoothstep(latE0, latE1, lateralSide > 0.0 ? u : 1.0 - u);
  float inner = smoothstep(in0, in1, a) * (1.0 - smoothstep(hemFrom, (hemFrom + hemTo) * 0.5, xy.y / boxH));
  float mod = 1.0 - inner + inner * max(lowFloor, low * lat);
  // Alpha carries the outline and the fine density; the coarse interior density rides in the
  // colour (premultiplied grey), which the compositor applies after its brightness clamp.
  float o = e * d * fade;
  return half4(o * mod, o * mod, o * mod, o);
}`;

let maskEffect: SkRuntimeEffect | null = null;
function mask(): SkRuntimeEffect {
  maskEffect ??= Skia.RuntimeEffect.Make(MASK_SKSL);
  if (!maskEffect) throw new Error('apparition: mask shader failed to compile');
  return maskEffect;
}

/**
 * Offscreen surface. Native: GPU (`MakeOffscreen`). Web: CanvasKit's CPU surface, because
 * `MakeOffscreen` there opens a new WebGL context per call and its textures cannot be drawn on the
 * on-screen canvas's context. Either way the snapshot ends as a raster image.
 */
export function makeSurface(w: number, h: number): SkSurface | null {
  if (Platform.OS === 'web') return Skia.Surface.Make(w, h);
  return Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
}

/** Snapshot as a CPU image, so it can be drawn on any canvas and cached. */
export function snapshot(surface: SkSurface): SkImage {
  surface.flush();
  const img = surface.makeImageSnapshot();
  return Platform.OS === 'web' ? img : (img.makeNonTextureImage() ?? img);
}

/** Polygons (normalised) to one Skia path in pixels; nonzero fill draws their union. */
export function polysToPath(polys: readonly (readonly Pt[])[], w: number, h: number): SkPath {
  const b = Skia.PathBuilder.Make();
  for (const poly of polys) {
    poly.forEach(([u, v], i) => (i ? b.lineTo(u * w, v * h) : b.moveTo(u * w, v * h)));
    b.close();
  }
  return b.detach();
}

export interface ApparitionRequest {
  /** 0..5, see `VARIANT_NAMES`. */
  variant: number;
  seed: number;
  /** Image size in pixels. Keep it near the drawn size (x pixel ratio); the figure is 1:2. */
  width: number;
  height: number;
}

const CACHE_MAX = 24;
const cache = new Map<string, SkImage>();

/** Draw a silhouette into a new image. Not cached; use `renderApparition`. */
export function drawSilhouette(sil: Silhouette, width: number, height: number): SkImage | null {
  const W = Math.max(8, Math.round(width));
  const H = Math.max(16, Math.round(height));
  const surface = makeSurface(W, H);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  const clear = Skia.Color('transparent');

  // Pass 1: union of the parts minus the cut, displaced by FractalNoise, then feathered.
  const sigma = Math.max(0.5, sil.feather * W);
  const dispNoise = Skia.Shader.MakeFractalNoise(NOISE_CYCLES / W, NOISE_CYCLES / W, 2, sil.seed * 7 + 11, 0, 0);
  const filter = Skia.ImageFilter.MakeBlur(
    sigma,
    sigma,
    TileMode.Decal,
    Skia.ImageFilter.MakeDisplacementMap(ColorChannel.R, ColorChannel.G, sil.displace * W, Skia.ImageFilter.MakeShader(dispNoise), null),
  );
  const layer = Skia.Paint();
  layer.setImageFilter(filter);
  canvas.clear(clear);
  canvas.saveLayer(layer);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color('white'));
  // Soft parts (an arm hint) first; full-weight parts over them give max(weights), as in metrics.
  for (const p of sil.parts.filter((q) => q.weight < 1)) {
    paint.setAlphaf(p.weight);
    canvas.drawPath(polysToPath([p.poly], W, H), paint);
  }
  paint.setAlphaf(1);
  canvas.drawPath(polysToPath(sil.parts.filter((q) => q.weight >= 1).map((q) => q.poly), W, H), paint);
  if (sil.cut) {
    const erase = Skia.Paint();
    erase.setAntiAlias(true);
    erase.setBlendMode(BlendMode.DstOut);
    canvas.drawPath(polysToPath([sil.cut], W, H), erase);
  }
  canvas.restore();
  const shape = snapshot(surface);

  // Pass 2: noise alpha mask (edge erosion, interior density floor).
  canvas.clear(clear);
  const nEdge = Skia.Shader.MakeFractalNoise(NOISE_CYCLES / W, NOISE_CYCLES / W, 2, sil.seed * 13 + 5, 0, 0);
  const nDen = Skia.Shader.MakeFractalNoise((NOISE_CYCLES * 0.7) / W, (NOISE_CYCLES * 0.7) / W, 2, sil.seed * 13 + 8, 0, 0);
  // Low-frequency density patches (D-017): 1.6 cycles per width down the body, 3.2 across it.
  const nLow = Skia.Shader.MakeFractalNoise(DENSITY_CYCLES_X / W, DENSITY_CYCLES / W, 2, sil.seed * 17 + 3, 0, 0);
  const shader = mask().makeShaderWithChildren(
    [
      sil.erode,
      sil.densityFloor,
      sil.fade.floor,
      sil.fade.from,
      sil.fade.to,
      H,
      DENSITY_FLOOR,
      DENSITY_EDGES[0],
      DENSITY_EDGES[1],
      W,
      sil.lateral,
      sil.lateralSide,
      LATERAL_EDGES[0],
      LATERAL_EDGES[1],
      INTERIOR[0],
      INTERIOR[1],
    ],
    [shape.makeShaderOptions(TileMode.Decal, TileMode.Decal, FilterMode.Linear, MipmapMode.None), nEdge, nDen, nLow],
  );
  const fill = Skia.Paint();
  fill.setShader(shader);
  canvas.drawRect(Skia.XYWHRect(0, 0, W, H), fill);
  return snapshot(surface);
}

/**
 * The apparition for a variant and seed as an `SkImage` (alpha carries the figure, grey/alpha its interior density), drawn
 * through an offscreen surface and cached per variant, seed and size.
 */
export function renderApparition({ variant, seed, width, height }: ApparitionRequest): SkImage | null {
  const key = `${variant}:${seed}:${Math.round(width)}x${Math.round(height)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const img = drawSilhouette(buildSilhouette(variant, seed), width, height);
  if (!img) return null;
  cache.set(key, img);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return img;
}
