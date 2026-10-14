import { t } from '../../i18n';
import { Canvas, Group, Line, Path, Skia, SweepGradient, vec } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { Bloom, PHOSPHOR, withAlpha, type PhosphorStep } from '../../fx/glass';
import { color } from '../tokens';
import { SWEEP_STATIC_DEG, sweepPeriodMs, sweepStep } from './sweep';

// The live radar sweep over the camera area (D-017): a wedge that turns about the reticle centre,
// clipped to a scope ring with 12 ticks. The wedge is the leading edge (p4 over a
// 3 px n0 outline, so it holds on a bright scene) and a decaying sector behind it: about 28 degrees,
// the arc the line covers in 450 ms (TAU.sweep) at the slow turn, fading exponentially.
//
// Performance (P3-09): the wedge is drawn once into its own canvas and turned by a transform from a
// reanimated shared value, so a frame costs no React render and no Skia redraw (on web each canvas
// redraw is a WebGL flush; the old per-frame trail of wedges held the viewfinder at 100 ms a frame on
// SwiftShader). Under ?static=1 it is frozen at SWEEP_STATIC_DEG. `running` false stops the clock.

/** Sector behind the leading edge, degrees (D-017: 25 to 30). */
export const SWEEP_SECTOR_DEG = 28;
const REDUCED_SECTOR_DEG = 8;
/** Peak alpha of the sector, just behind the leading edge. */
const SECTOR_ALPHA = 0.42;
/** Gap between the scope ring and the edge of the camera area, px. */
const RING_INSET = 6;
const LABEL_HZ = 4;

export function Sweep({
  width,
  height,
  cx,
  cy,
  mg,
  isStatic,
  running,
  reduceMotion,
}: {
  width: number;
  height: number;
  cx: number;
  cy: number;
  mg: number;
  isStatic: boolean;
  running: boolean;
  reduceMotion: boolean;
}) {
  const period = useSharedValue(sweepPeriodMs(mg));
  const rot = useSharedValue(SWEEP_STATIC_DEG);
  useEffect(() => {
    period.set(sweepPeriodMs(mg));
  }, [mg, period]);

  const live = !isStatic && running;
  const clock = useFrameCallback((info) => {
    'worklet';
    // A long stall (a backgrounded tab) advances by at most 100 ms so the line never jumps.
    const dt = Math.max(0, Math.min(100, info.timeSincePreviousFrame ?? 0));
    rot.set((rot.get() + (dt * 360) / period.get()) % 360);
  }, false);
  useEffect(() => {
    clock.setActive(live);
    if (isStatic) rot.set(SWEEP_STATIC_DEG);
  }, [clock, live, isStatic, rot]);

  // The angle for screen readers and tests, sampled a few times a second (never per frame).
  const [label, setLabel] = useState(SWEEP_STATIC_DEG);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setLabel(Math.round(rot.get())), 1000 / LABEL_HZ);
    return () => clearInterval(id);
  }, [live, rot]);
  const shown = isStatic ? SWEEP_STATIC_DEG : label;

  const r = Math.max(8, Math.floor(Math.min(cx, width - cx, cy, height - cy)) - RING_INSET);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.get()}deg` }] }));
  const step = sweepStep(mg);

  return (
    <View style={[s.fill, { width, height }]} pointerEvents="none" testID="hud-sweep" aria-valuetext={t('a11y.deg', { n: shown })}>
      <Rings cx={cx} cy={cy} r={r} />
      <Animated.View style={[s.abs, { left: cx - r - 2, top: cy - r - 2, width: 2 * r + 4, height: 2 * r + 4 }, spin]}>
        <Wedge r={r} step={step} sector={reduceMotion ? REDUCED_SECTOR_DEG : SWEEP_SECTOR_DEG} />
      </Animated.View>
    </View>
  );
}

// The scope ring with 12 inward ticks at 30 degrees, 4 px long, in p2: plain views (no canvas).
const TICK_DEGS = Array.from({ length: 12 }, (_, k) => k * 30);
const Rings = memo(function Rings({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <>
      <View style={[s.abs, { left: cx - r, top: cy - r, width: 2 * r, height: 2 * r, borderRadius: r, borderWidth: 1, borderColor: withAlpha(color.p2, 0.45) }]} />
      {TICK_DEGS.map((deg) => (
        <View key={deg} style={[s.abs, { left: cx, top: cy, width: 0, height: 0, transform: [{ rotate: `${deg}deg` }] }]}>
          <View style={{ position: 'absolute', left: -0.5, top: -r + 1, width: 1, height: 4, backgroundColor: color.p2 }} />
        </View>
      ))}
    </>
  );
});

// The wedge pointing straight up from the centre of a (2r + 4) square canvas, drawn once.
const Wedge = memo(function Wedge({ r, step, sector }: { r: number; step: PhosphorStep; sector: number }) {
  const c = r + 2;
  const sectorPath = useMemo(() => {
    // Skia angles run clockwise from 3 o'clock; straight up is 270.
    const b = Skia.PathBuilder.Make();
    b.moveTo(c, c);
    b.arcToOval(Skia.XYWHRect(c - r, c - r, 2 * r, 2 * r), 270 - sector, sector, false);
    b.close();
    return b.detach();
  }, [c, r, sector]);
  // Exponential decay across the sector, tail (0) to leading edge (1): exp(-3 (1 - t)).
  const stops = [0, 0.25, 0.5, 0.75, 0.9, 1];
  const tint = PHOSPHOR[step];
  const colors = stops.map((t) => withAlpha(tint, SECTOR_ALPHA * Math.exp(-3 * (1 - t)) * (t === 0 ? 0 : 1)));
  const tip = vec(c, c - r);
  return (
    <Canvas style={{ width: 2 * c, height: 2 * c }} pointerEvents="none">
      <Path path={sectorPath}>
        <SweepGradient c={vec(c, c)} start={270 - sector} end={270} colors={colors} positions={stops} />
      </Path>
      <Group>
        <Line p1={vec(c, c)} p2={tip} strokeWidth={3} color={withAlpha(color.n0, 0.55)} />
        <Bloom radius={3}>
          <Line p1={vec(c, c)} p2={tip} strokeWidth={1.5} color={PHOSPHOR[4]} />
        </Bloom>
      </Group>
    </Canvas>
  );
});

const s = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  abs: { position: 'absolute' },
});
