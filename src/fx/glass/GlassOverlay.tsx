import { Canvas, Circle, FractalNoise, Group, LinearGradient, Path, Rect, Shader, Skia, vec } from '@shopify/react-native-skia';
import { memo, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { color, fx } from '../../ui/tokens';
import { hexToRgb, withAlpha } from './color';
import { dustField } from './dust';
import { useGlassEffect } from './shaders';
import { useStaticDefault, useTicker } from './useGlassClock';

export type GlassLayerFlags = {
  scanlines?: boolean;
  grain?: boolean;
  vignette?: boolean;
  dust?: boolean;
  shadow?: boolean;
};

export type GlassLayersProps = GlassLayerFlags & {
  width: number;
  height: number;
  // Install seed: fixes the dust and scratches and the grain sequence.
  seed?: number;
  // Settled, byte-stable render: grain frozen at the seed, no timers.
  static?: boolean;
  // Scales every layer's alpha (1 = Bible values; 0 hides the glass).
  intensity?: number;
  // Grain re-seed rate while animating (Bible §6 says 24 fps; P3-02 runs 12 Hz).
  grainHz?: number;
  // Grain resolution. In <GlassOverlay> and <GlassWarp> (default 2) grain has its own canvas
  // at 1/scale size, stretched back up: 2 runs the noise on a quarter of the pixels (the
  // measured fix, README). Inside a shared canvas (<GlassLayers>, default 1) it only snaps the
  // noise to a 2x2 lattice, which coarsens the look without saving work.
  grainScale?: 1 | 2;
};

const GRAIN_FREQ = 0.9;
const SHADOW_PX = 2;

// The glass drawn as Skia nodes, for use inside an existing <Canvas> (a screen that already
// draws its glass in Skia can put this last in its tree). <GlassOverlay> wraps it in a canvas.
export function GlassLayers({
  width,
  height,
  seed = 1,
  static: isStaticProp,
  intensity = 1,
  grainHz = 12,
  grainScale = 1,
  scanlines = true,
  grain = true,
  vignette = true,
  dust = true,
  shadow = true,
}: GlassLayersProps) {
  const isStatic = useStaticDefault(isStaticProp);
  const effect = useGlassEffect();
  const tick = useTicker(grainHz, grain && !isStatic && intensity > 0);
  const field = useMemo(() => dustField(seed), [seed]);
  const scratchPath = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    for (const s of field.scratches) {
      const x0 = s.x0 * width;
      const y0 = s.y0 * height;
      const dx = Math.cos(s.angle) * s.len;
      const dy = Math.sin(s.angle) * s.len;
      // Quadratic with the control point pushed sideways by `bow` of the length.
      const mx = x0 + dx / 2 - dy * s.bow;
      const my = y0 + dy / 2 + dx * s.bow;
      b.moveTo(x0, y0);
      b.quadTo(mx, my, x0 + dx, y0 + dy);
    }
    return b.detach();
  }, [field, width, height]);

  if (width <= 0 || height <= 0) return null;
  const k = Math.max(0, intensity);
  const uniforms = {
    size: [width, height],
    scan: scanlines ? fx.scanline * k : 0,
    scanTint: hexToRgb(color.p0),
    vig: vignette ? fx.vignette * k : 0,
    vigTint: hexToRgb(color.n0),
    grain: grain ? fx.grain * k : 0,
    grainTint: hexToRgb(color.p4),
    grainScale,
  };
  return (
    <Group>
      <Rect x={0} y={0} width={width} height={height}>
        <Shader source={effect} uniforms={uniforms}>
          <FractalNoise freqX={GRAIN_FREQ / grainScale} freqY={GRAIN_FREQ / grainScale} octaves={2} seed={(seed + tick * 7919) % 100000} />
        </Shader>
      </Rect>
      {dust && k > 0 ? (
        <Group>
          {field.specks.map((s, i) => (
            <Circle key={i} cx={s.x * width} cy={s.y * height} r={s.r} color={color.n4} opacity={Math.min(1, s.alpha * k)} />
          ))}
          <Path path={scratchPath} color={color.n4} opacity={Math.min(1, field.scratches[0]!.alpha * k)} style="stroke" strokeWidth={0.6} strokeCap="round" />
        </Group>
      ) : null}
      {shadow && k > 0 ? (
        <Group opacity={Math.min(1, k)}>
          <Rect x={0} y={0} width={width} height={SHADOW_PX}>
            <LinearGradient start={vec(0, 0)} end={vec(0, SHADOW_PX)} colors={[color.n1, withAlpha(color.n1, 0.5)]} />
          </Rect>
          <Rect x={0} y={0} width={SHADOW_PX} height={height}>
            <LinearGradient start={vec(0, 0)} end={vec(SHADOW_PX, 0)} colors={[color.n1, withAlpha(color.n1, 0.5)]} />
          </Rect>
        </Group>
      ) : null}
    </Group>
  );
}

// Grain alone, for its own canvas. At `scale` 2 the canvas is half size and stretched back up
// by a view transform, so the shader runs on a quarter of the pixels.
export function GrainCanvas({ width, height, seed, isStatic, intensity, hz, scale, clip }: { width: number; height: number; seed: number; isStatic: boolean; intensity: number; hz: number; scale: 1 | 2; clip?: ReturnType<typeof Skia.RRectXY> }) {
  const effect = useGlassEffect();
  const tick = useTicker(hz, !isStatic && intensity > 0);
  const w = Math.ceil(width / scale);
  const h = Math.ceil(height / scale);
  const uniforms = {
    size: [w, h],
    scan: 0,
    scanTint: [0, 0, 0],
    vig: 0,
    vigTint: [0, 0, 0],
    grain: fx.grain * intensity,
    grainTint: hexToRgb(color.p4),
    grainScale: 1,
  };
  const half = scale === 2;
  return (
    <View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: 0, top: 0, width: w, height: h },
        half ? { transformOrigin: 'top left', transform: [{ scale: 2 }] } : null,
      ]}
    >
      <Canvas pointerEvents="none" style={{ width: w, height: h }}>
        <Group clip={clip} transform={half ? [{ scale: 0.5 }] : undefined}>
          <Group transform={half ? [{ scale: 2 }] : undefined}>
            <Rect x={0} y={0} width={w} height={h}>
              <Shader source={effect} uniforms={uniforms}>
                <FractalNoise freqX={GRAIN_FREQ * scale} freqY={GRAIN_FREQ * scale} octaves={2} seed={(seed + tick * 7919) % 100000} />
              </Shader>
            </Rect>
          </Group>
        </Group>
      </Canvas>
    </View>
  );
}

export type GlassOverlayProps = Omit<GlassLayersProps, 'width' | 'height'> & {
  // Clips the glass to the window's corner radius (Bible §2: 18).
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

// A pointer-transparent canvas that fills its parent and lays the glass over whatever React
// Native views sit beneath it. Put it last among the window's children. The static layers
// (scanlines, vignette, dust, shadow) sit in one canvas that draws once; grain has its own
// canvas, so a grain tick redraws only the grain. Memoised: a parent that re-renders at 10 to 20 Hz
// (the viewfinder's flux, the scan clock) must not redraw the window-sized canvas each time (on web
// every Skia canvas redraw is a WebGL flush, the main cost measured on SwiftShader).
export const GlassOverlay = memo(function GlassOverlay({ radius = 0, style, testID, ...layers }: GlassOverlayProps) {
  const isStatic = useStaticDefault(layers.static);
  const intensity = Math.max(0, layers.intensity ?? 1);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b.w === width && b.h === height ? b : { w: width, h: height }));
  };
  const clip = useMemo(
    () => (radius > 0 && box.w > 0 ? Skia.RRectXY(Skia.XYWHRect(0, 0, box.w, box.h), radius, radius) : undefined),
    [radius, box.w, box.h],
  );
  return (
    <View testID={testID} pointerEvents="none" onLayout={onLayout} style={[StyleSheet.absoluteFill, style]}>
      {box.w > 0 ? (
        <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Group clip={clip}>
            <GlassLayers width={box.w} height={box.h} {...layers} grain={false} />
          </Group>
        </Canvas>
      ) : null}
      {box.w > 0 && (layers.grain ?? true) && intensity > 0 ? (
        <GrainCanvas
          width={box.w}
          height={box.h}
          seed={layers.seed ?? 1}
          isStatic={isStatic}
          intensity={intensity}
          hz={layers.grainHz ?? 12}
          scale={layers.grainScale ?? 2}
          clip={clip}
        />
      ) : null}
    </View>
  );
});
