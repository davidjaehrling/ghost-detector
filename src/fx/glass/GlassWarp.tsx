import { Canvas, Group, ImageShader, Rect, Shader, Skia, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { color, fx } from '../../ui/tokens';
import { hexToRgb } from './color';
import { GlassLayers, GlassOverlay, GrainCanvas, type GlassLayersProps } from './GlassOverlay';
import { afterFrames } from './ready';
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
  // Fired with String(refreshKey) once each snapshot has landed: two animation frames after the
  // warped canvas mounted, so the barrel pass has drawn. Not fired when a snapshot fails (the
  // flat overlay stays). On web the `${testID}-warped` node also carries data-warped="<key>".
  onSnapshot?: (key: string) => void;
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
  const [landed, setLanded] = useState<string | null>(null);
  const onSnapshotRef = useRef(onSnapshot);
  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  });
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
          },
          (err: unknown) => {
            console.warn('GlassWarp: snapshot failed, showing the flat overlay', err);
          },
        );
      });
    });
    return () => {
      live = false;
      cancelAnimationFrame(raf1);
    };
  }, [refreshKey, box.w, box.h]);

  // The landed signal: two frames after the warped canvas mounted with this snapshot.
  useEffect(() => {
    if (!snap) return;
    const key = String(snap.key);
    return afterFrames(2, () => {
      setLanded(key);
      onSnapshotRef.current?.(key);
    });
  }, [snap]);

  const clip = useMemo(
    () => (radius > 0 && box.w > 0 ? Skia.RRectXY(Skia.XYWHRect(0, 0, box.w, box.h), radius, radius) : undefined),
    [radius, box.w, box.h],
  );
  const fresh = snap !== null && snap.key === refreshKey;
  // Web only: react-native-web turns dataSet into data-* attributes (not in RN's View types).
  const warpedData = (Platform.OS === 'web' && fresh && landed === String(snap.key) ? { dataSet: { warped: landed } } : {}) as Record<string, unknown>;

  return (
    <View testID={testID} style={[styles.root, style]} onLayout={onLayout}>
      <View ref={ref} collapsable={false} style={styles.content}>
        {children}
      </View>
      {fresh && box.w > 0 ? (
        <View testID={testID ? `${testID}-warped` : undefined} pointerEvents="none" style={StyleSheet.absoluteFill} {...warpedData}>
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
