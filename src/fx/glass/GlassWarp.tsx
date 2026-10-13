import { Canvas, Group, ImageShader, Rect, Shader, Skia, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { color, fx } from '../../ui/tokens';
import { hexToRgb } from './color';
import { GlassLayers, GlassOverlay, GrainCanvas, type GlassLayersProps } from './GlassOverlay';
import { useBarrelEffect } from './shaders';
import { snapshotView } from './snapshotView';
import { useStaticDefault } from './useGlassClock';

export type GlassWarpProps = Omit<GlassLayersProps, 'width' | 'height'> & {
  children: ReactNode;
  // Change it to take a new snapshot (new reading, photo loaded, tier landed).
  refreshKey?: string | number;
  // Barrel strength k (Bible §2: 1.5%).
  barrel?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  onSnapshot?: (ok: boolean) => void;
};

// Barrel curvature for static-ish screens (boot, result). An overlay cannot bend the views
// beneath it, so this snapshots its children once (and again on each `refreshKey` change),
// then draws the snapshot through the barrel shader with the glass layers on top (grain in
// its own half-size canvas, so a grain tick does not re-run the barrel pass). The
// children stay mounted underneath for layout, touch and screen readers; touches land on them
// through the pointer-transparent canvas (the bend moves content by at most ~6 px at the
// corners). Anything that animates under it freezes until the next refresh, so the live
// viewfinder uses <GlassOverlay> only. Until the first snapshot is ready it shows the children
// under a flat <GlassOverlay>.
export function GlassWarp({ children, refreshKey = 0, barrel = fx.barrel, radius = 0, style, testID, onSnapshot, ...layers }: GlassWarpProps) {
  const ref = useRef<View>(null);
  const isStatic = useStaticDefault(layers.static);
  const intensity = Math.max(0, layers.intensity ?? 1);
  const effect = useBarrelEffect();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [snap, setSnap] = useState<{ image: SkImage; key: string | number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b.w === width && b.h === height ? b : { w: width, h: height }));
  };

  useEffect(() => {
    if (box.w <= 0 || box.h <= 0) return;
    let live = true;
    // Two frames so the children have painted (fonts are loaded before any route renders).
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        snapshotView(ref).then(
          (image) => {
            if (!live) return;
            if (image) setSnap({ image, key: refreshKey });
            onSnapshot?.(image !== null);
          },
          (err: unknown) => {
            console.warn('GlassWarp: snapshot failed, showing the flat overlay', err);
            if (live) onSnapshot?.(false);
          },
        );
      });
    });
    return () => {
      live = false;
      cancelAnimationFrame(raf1);
    };
    // onSnapshot is a notification only; a new closure must not trigger a new snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, box.w, box.h]);

  const clip = useMemo(
    () => (radius > 0 && box.w > 0 ? Skia.RRectXY(Skia.XYWHRect(0, 0, box.w, box.h), radius, radius) : undefined),
    [radius, box.w, box.h],
  );
  const fresh = snap !== null && snap.key === refreshKey;

  return (
    <View testID={testID} style={[styles.root, style]} onLayout={onLayout}>
      <View ref={ref} collapsable={false} style={styles.content}>
        {children}
      </View>
      {fresh && box.w > 0 ? (
        <View testID={testID ? `${testID}-warped` : undefined} pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Group clip={clip}>
              <Rect x={0} y={0} width={box.w} height={box.h}>
                <Shader source={effect} uniforms={{ size: [box.w, box.h], k: barrel, bg: hexToRgb(color.n0) }}>
                  <ImageShader image={snap.image} fit="fill" x={0} y={0} width={box.w} height={box.h} />
                </Shader>
              </Rect>
              <GlassLayers width={box.w} height={box.h} {...layers} grain={false} />
            </Group>
          </Canvas>
          {(layers.grain ?? true) && intensity > 0 ? (
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
      ) : (
        <GlassOverlay radius={radius} {...layers} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative', overflow: 'hidden' },
  content: { flexGrow: 1 },
});
