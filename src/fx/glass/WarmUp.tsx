import { Canvas, Group, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { color, motion } from '../../ui/tokens';
import { withAlpha } from './color';
import { warmBrightness } from './persistence';
import { useElapsed, useStaticDefault } from './useGlassClock';

export type WarmUpProps = {
  durationMs?: number;
  static?: boolean;
  reduceMotion?: boolean;
  // Change it to play the warm-up again (a new power-on).
  runKey?: string | number;
  onDone?: () => void;
  testID?: string;
};

const BAND_PX = 2;

// The 900 ms tube warm-up (Bible §7): an n0 veil that lifts from opaque to clear while a 2 px
// bright band rolls down the glass once. Then it renders nothing. `static` and `reduceMotion`
// render the finished state (nothing) at once and still call onDone.
export function WarmUp({ durationMs = motion.warmup, static: isStaticProp, reduceMotion = false, runKey = 0, onDone, testID }: WarmUpProps) {
  const isStatic = useStaticDefault(isStaticProp);
  const running = !isStatic && !reduceMotion && durationMs > 0;
  const t = useElapsed(durationMs, running, runKey);
  const done = !running || t >= durationMs;
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (done) onDone?.();
    // Fire once per run when it finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, runKey]);
  if (done) return null;
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b.w === width && b.h === height ? b : { w: width, h: height }));
  };
  const p = t / durationMs;
  const veil = 1 - warmBrightness(p);
  const bandY = Math.round(p * (box.h + BAND_PX)) - BAND_PX;
  return (
    <View testID={testID} pointerEvents="none" onLayout={onLayout} style={StyleSheet.absoluteFill}>
      {box.w > 0 ? (
        <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Rect x={0} y={0} width={box.w} height={box.h} color={color.n0} opacity={veil} />
          <Group opacity={0.5 * (1 - p)}>
            <Rect x={0} y={bandY - 6} width={box.w} height={6}>
              <LinearGradient start={vec(0, bandY - 6)} end={vec(0, bandY)} colors={[withAlpha(color.p3, 0), withAlpha(color.p3, 0.6)]} />
            </Rect>
            <Rect x={0} y={bandY} width={box.w} height={BAND_PX} color={color.p5} />
          </Group>
        </Canvas>
      ) : null}
    </View>
  );
}
