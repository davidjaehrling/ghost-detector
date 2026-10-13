import { ImageShader, Rect, Shader, Skia, useImage, type SkImage, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { memo, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { color, fx } from '../../ui/tokens';
import { PHOSPHOR, hexToRgb, withAlpha } from './color';
import { FEED_LIFT, FEED_MIX } from './feed';
import { SnapshotCanvas } from './snapshotRegistry';

// The camera feed seen through the tube (D-017): the picture's luma mapped onto the phosphor ramp
// (p0 to p5) and mixed over its own colour at `mix` (25 to 35%), the blacks lifted toward p0, and
// the slight barrel of the glass. Scanlines and grain come from the <Glass> overlay on top, as for
// everything else on the window.
//
// Two ways in:
// - `image` (a URI or an SkImage: the fixture photo, a stored frame): drawn by Skia through
//   FEED_SKSL. One static canvas, drawn once per image and size.
// - children (the live CameraView, which Skia cannot sample without a frame processor): the
//   children render as they are, under two RN layers that approximate the shader: a phosphor
//   `color` blend at `mix` (keeps the camera's luminosity, takes the phosphor hue) and a p0
//   `screen` layer that lifts the blacks. No barrel on this path (logged in the README).

export const FEED_SKSL = `
uniform shader image;
uniform float2 size;
uniform float k;
uniform float mixAmt;
uniform float lift;
uniform float3 bg;
uniform float3 c0;
uniform float3 c1;
uniform float3 c2;
uniform float3 c3;
uniform float3 c4;
uniform float3 c5;

const half3 W = half3(0.299, 0.587, 0.114);

float3 ramp(float s) {
  s = clamp(s, 0.0, 1.0) * 5.0;
  if (s < 1.0) return mix(c0, c1, s);
  if (s < 2.0) return mix(c1, c2, s - 1.0);
  if (s < 3.0) return mix(c2, c3, s - 2.0);
  if (s < 4.0) return mix(c3, c4, s - 3.0);
  return mix(c4, c5, s - 4.0);
}

half4 main(float2 xy) {
  float2 p = (xy / size) * 2.0 - 1.0;
  float2 q = p * (1.0 + k * dot(p, p));
  float2 uv = (q + 1.0) * 0.5 * size;
  float2 edge = min(uv, size - uv);
  float inside = clamp(min(edge.x, edge.y) + 0.5, 0.0, 1.0);
  float3 c = float3(image.eval(clamp(uv, float2(0.5), size - 0.5)).rgb);
  float l = dot(half3(c), W);
  float3 o = mix(c, ramp(l), mixAmt);
  float3 floorC = c0 * lift;
  o = floorC + o * (1.0 - floorC);
  return half4(half3(mix(bg, o, inside)), 1.0);
}`;

export function makeFeedEffect(): SkRuntimeEffect {
  const e = Skia.RuntimeEffect.Make(FEED_SKSL);
  if (!e) throw new Error('glass: feed shader failed to compile');
  return e;
}

export type FeedTintProps = {
  /** A still to draw through the shader (fixture photo, stored frame). Without it, `children` get the RN approximation. */
  image?: SkImage | string | null;
  children?: ReactNode;
  mix?: number;
  lift?: number;
  /** Barrel strength (the glass's k); 0 turns it off. Only on the `image` path. */
  barrel?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function FeedTint({ image, children, mix = FEED_MIX, lift = FEED_LIFT, barrel = fx.barrel, style, testID }: FeedTintProps) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b.w === width && b.h === height ? b : { w: width, h: height }));
  };
  if (image === undefined) {
    return (
      <View testID={testID} style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
        {children}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color.p3, opacity: mix, mixBlendMode: 'color' }]} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(color.p0, 1), opacity: lift, mixBlendMode: 'screen' }]} />
      </View>
    );
  }
  return (
    <View testID={testID} style={[StyleSheet.absoluteFill, style]} pointerEvents="none" onLayout={onLayout}>
      {box.w > 0 && image !== null ? <FeedCanvas image={image} w={box.w} h={box.h} mix={mix} lift={lift} barrel={barrel} /> : null}
    </View>
  );
}

const FeedCanvas = memo(function FeedCanvas({ image, w, h, mix, lift, barrel }: { image: SkImage | string; w: number; h: number; mix: number; lift: number; barrel: number }) {
  const loaded = useImage(typeof image === 'string' ? image : null);
  const img = typeof image === 'string' ? loaded : image;
  const effect = useMemo(() => makeFeedEffect(), []);
  if (!img) return null;
  // Cover crop, centred (as resizeMode="cover").
  const s = Math.max(w / img.width(), h / img.height());
  const rect = { x: (w - img.width() * s) / 2, y: (h - img.height() * s) / 2, width: img.width() * s, height: img.height() * s };
  const ph = PHOSPHOR.map(hexToRgb);
  const uniforms = { size: [w, h], k: barrel, mixAmt: mix, lift, bg: hexToRgb(color.n0), c0: ph[0]!, c1: ph[1]!, c2: ph[2]!, c3: ph[3]!, c4: ph[4]!, c5: ph[5]! };
  return (
    <SnapshotCanvas style={{ width: w, height: h }} pointerEvents="none">
      <Rect x={0} y={0} width={w} height={h}>
        <Shader source={effect} uniforms={uniforms}>
          <ImageShader image={img} fit="fill" rect={rect} tx="clamp" ty="clamp" />
        </Shader>
      </Rect>
    </SnapshotCanvas>
  );
});
