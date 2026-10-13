import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { useMemo } from 'react';

// SkSL for the glass. Compiled inside hooks (useMemo), never at module load: on web the Skia
// API exists only after CanvasKit has loaded.

// One pass for scanlines, vignette and grain. Each layer is composited source-over onto a
// transparent start, so the result is one premultiplied colour laid over whatever is beneath.
// Layer strengths are uniforms; 0 turns a layer off.
//  - scanlines: every second 1 px row of a 2 px pitch gets `scanTint` at `scan` alpha
//    (p0 darkens lit content and tints it toward the phosphor).
//  - vignette: n0 at up to `vig` alpha in the corners, rising with distance^2.5.
//  - grain: FractalNoise centred on 0.5, stretched to -1..1 and scaled by `grain`; positive
//    adds `grainTint` light, negative darkens (same mapping as the P3-01 probe).
//    `grainScale` > 1 evaluates the noise on a coarser lattice (cheaper look-alike, see README).
export const GLASS_SKSL = `
uniform shader noise;
uniform float2 size;
uniform float scan;
uniform float3 scanTint;
uniform float vig;
uniform float3 vigTint;
uniform float grain;
uniform float3 grainTint;
uniform float grainScale;

half4 over(half4 dst, half4 src) { return src + dst * (1.0 - src.a); }

half4 main(float2 xy) {
  half4 o = half4(0.0);
  if (scan > 0.0 && mod(floor(xy.y), 2.0) >= 1.0) {
    o = over(o, half4(half3(scanTint) * scan, scan));
  }
  if (vig > 0.0) {
    float2 p = (xy / size) * 2.0 - 1.0;
    float d = clamp(length(p) * 0.70710678, 0.0, 1.0);
    float a = vig * pow(d, 2.5);
    o = over(o, half4(half3(vigTint) * a, a));
  }
  if (grain > 0.0) {
    half4 n = noise.eval(floor(xy / grainScale) * grainScale);
    float v = n.a > 0.0 ? n.r / n.a : 0.5;
    float s = clamp((v - 0.5) * 4.0, -1.0, 1.0) * grain;
    if (s >= 0.0) o = over(o, half4(half3(grainTint) * s, s));
    else o = over(o, half4(0.0, 0.0, 0.0, -s));
  }
  return o;
}`;

// Barrel curvature for <GlassWarp>: the output pixel at normalised radius r samples the
// snapshot at r * (1 + k r^2). Outside the tube it shows `bg` (n0), with a 1 px soft edge.
export const BARREL_SKSL = `
uniform shader image;
uniform float2 size;
uniform float k;
uniform float3 bg;

half4 main(float2 xy) {
  float2 p = (xy / size) * 2.0 - 1.0;
  float2 q = p * (1.0 + k * dot(p, p));
  float2 uv = (q + 1.0) * 0.5 * size;
  float2 edge = min(uv, size - uv);
  float inside = clamp(min(edge.x, edge.y) + 0.5, 0.0, 1.0);
  half4 c = image.eval(clamp(uv, float2(0.5), size - 0.5));
  return mix(half4(half3(bg), 1.0), c, inside);
}`;

function compile(src: string, name: string): SkRuntimeEffect {
  const e = Skia.RuntimeEffect.Make(src);
  if (!e) throw new Error(`glass: ${name} shader failed to compile`);
  return e;
}

export function useGlassEffect(): SkRuntimeEffect {
  return useMemo(() => compile(GLASS_SKSL, 'glass'), []);
}

export function useBarrelEffect(): SkRuntimeEffect {
  return useMemo(() => compile(BARREL_SKSL, 'barrel'), []);
}
