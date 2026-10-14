/**
 * Skia side of the apparition library: the `shape.ts` polygons drawn into an offscreen surface,
 * displaced by FractalNoise, feathered, cut by the same noise alpha mask that `metrics.ts`
 * reproduces in TS (which also roughens the edge and the hem), then feathered a second time. Call only after Skia is ready (on web, after CanvasKit loads): nothing here
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

import {
  DENSITY_CYCLES,
  DENSITY_CYCLES_X,
  DENSITY_EDGES,
  DENSITY_FLOOR,
  FEATHER2,
  HEM_RAG,
  HEM_RAG_CYCLES,
  INTERIOR,
  LATERAL_EDGES,
  NOISE_CYCLES,
  RAG_CORE,
  RAG_CYCLES,
  RAG_DISPLACE,
  RAG_EDGES,
  RAG_ERODE,
  RAG_STRETCH,
} from './metrics';
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
uniform shader nDisp;
uniform shader nRag;
uniform shader nHem;
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
uniform float ragDisp;
uniform float ragErode;
uniform float ragE0;
uniform float ragE1;
uniform float core0;
uniform float core1;
uniform float hemRag;
float unp(half4 n) { return n.a > 0.0 ? n.r / n.a : 0.5; }
float unpG(half4 n) { return n.a > 0.0 ? n.g / n.a : 0.5; }
float ro(float n) { return clamp((n - 0.5) * 2.5, -1.0, 1.0); }
half4 main(float2 xy) {
  // Ragged edge: the feathered shape sampled through a high-frequency displacement.
  half4 dn = nDisp.eval(xy);
  float2 dxy = xy + float2(ro(unp(dn)), ro(unpG(dn))) * ragDisp;
  float a = shape.eval(dxy).a;
  float bite = smoothstep(ragE0, ragE1, unp(nRag.eval(xy))) * (1.0 - smoothstep(core0, core1, a));
  float t = min(0.95, erode * unp(nEdge.eval(xy)) + ragErode * bite);
  float e = clamp((a - t) / max(1.0 - t, 0.001), 0.0, 1.0);
  float vf = xy.y / boxH + hemRag * ro(unp(nHem.eval(xy)));
  float d = floorD + (1.0 - floorD) * unp(nDen.eval(xy));
  float low = lowFloor + (1.0 - lowFloor) * smoothstep(lowE0, lowE1, unp(nLow.eval(xy)));
  float fade = 1.0 - (1.0 - hemFade) * smoothstep(hemFrom, hemTo, vf);
  float u = xy.x / boxW;
  float lat = 1.0 - lateral * smoothstep(latE0, latE1, lateralSide > 0.0 ? u : 1.0 - u);
  float inner = smoothstep(in0, in1, a) * (1.0 - smoothstep(hemFrom, (hemFrom + hemTo) * 0.5, vf));
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

/** `snapshot` for a surface that is not drawn again: the surface is freed (CanvasKit's wasm heap has no GC). */
export function snapshotFree(surface: SkSurface): SkImage {
  const img = snapshot(surface);
  surface.dispose();
  return img;
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
  const drawShape = (blur: number): SkImage => {
    const filter = Skia.ImageFilter.MakeBlur(
      blur,
      blur,
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
    return snapshot(surface);
  };
  const shape = drawShape(sigma);

  // Pass 2: noise alpha mask (ragged edge, edge erosion, ragged hem, interior density floor).
  canvas.clear(clear);
  const nEdge = Skia.Shader.MakeFractalNoise(NOISE_CYCLES / W, NOISE_CYCLES / W, 2, sil.seed * 13 + 5, 0, 0);
  const nDen = Skia.Shader.MakeFractalNoise((NOISE_CYCLES * 0.7) / W, (NOISE_CYCLES * 0.7) / W, 2, sil.seed * 13 + 8, 0, 0);
  // Low-frequency density patches (D-017): 1.6 cycles per width down the body, 3.2 across it.
  const nLow = Skia.Shader.MakeFractalNoise(DENSITY_CYCLES_X / W, DENSITY_CYCLES / W, 2, sil.seed * 17 + 3, 0, 0);
  // Ragged edge (D-022): isotropic high-frequency displacement, then erosion and hem noise
  // stretched down the body (streaks: teeth, notches and wisps).
  const nDisp = Skia.Shader.MakeFractalNoise(RAG_CYCLES / W, RAG_CYCLES / W, 2, sil.seed * 19 + 7, 0, 0);
  const nRag = Skia.Shader.MakeFractalNoise(RAG_CYCLES / W, (RAG_CYCLES * RAG_STRETCH) / W, 2, sil.seed * 19 + 8, 0, 0);
  const nHem = Skia.Shader.MakeFractalNoise(HEM_RAG_CYCLES / W, (HEM_RAG_CYCLES * RAG_STRETCH) / W, 2, sil.seed * 19 + 9, 0, 0);
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
      RAG_DISPLACE * 0.5 * W,
      RAG_ERODE,
      RAG_EDGES[0],
      RAG_EDGES[1],
      RAG_CORE[0],
      RAG_CORE[1],
      HEM_RAG * 0.5,
    ],
    [shape.makeShaderOptions(TileMode.Decal, TileMode.Decal, FilterMode.Linear, MipmapMode.None), nEdge, nDen, nLow, nDisp, nRag, nHem],
  );
  const fill = Skia.Paint();
  fill.setShader(shader);
  canvas.drawRect(Skia.XYWHRect(0, 0, W, H), fill);
  const masked = snapshot(surface);

  // Pass 3: a second, fine feather, so the ragged cut is soft at the pixel but stays ragged.
  canvas.clear(clear);
  const s2 = Math.max(0.3, FEATHER2 * W);
  const soft = Skia.Paint();
  soft.setImageFilter(Skia.ImageFilter.MakeBlur(s2, s2, TileMode.Decal, null));
  canvas.drawImage(masked, 0, 0, soft);
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
