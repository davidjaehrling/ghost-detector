import { Canvas, Group, Line, Path, vec } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Bloom, TAU, usePersistence } from '../../fx/glass';
import { SWEEP_STATIC_DEG, advanceSweep, sweepPeriodMs, sweepPoint, sweepStep } from './sweep';

// The live radar sweep over the camera area: a line about the reticle centre, with the phosphor
// tail of usePersistence(TAU.sweep). Under ?static=1 it is frozen at SWEEP_STATIC_DEG.
// `running` false (blurred, backgrounded) stops the clock.
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
  const period = sweepPeriodMs(mg);
  const periodRef = useRef(period);
  useEffect(() => {
    periodRef.current = period;
  }, [period]);
  const [deg, setDeg] = useState(SWEEP_STATIC_DEG);

  useEffect(() => {
    if (isStatic || !running) return;
    let raf = 0;
    let last = -1;
    const frame = (now: number) => {
      if (last >= 0) setDeg((d) => advanceSweep(d, now - last, periodRef.current));
      last = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isStatic, running]);

  // Half the diagonal reaches every corner of the camera area from its centre.
  const reach = Math.hypot(width, height);
  const trail = usePersistence(isStatic ? SWEEP_STATIC_DEG : Math.round(deg * 4) / 4, { tau: TAU.sweep, step: sweepStep(mg), static: isStatic, reduceMotion });

  return (
    <View style={[s.fill, { width, height }]} pointerEvents="none" testID="hud-sweep" aria-valuetext={`${Math.round(isStatic ? SWEEP_STATIC_DEG : deg)} deg`}>
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Group opacity={0.6}>
          {/* Wedges between consecutive samples make the tail continuous; the live sample is the line. */}
          {trail.slice(0, -1).map((sample, i) => {
            const next = trail[i + 1]!;
            const a = sweepPoint(cx, cy, reach, sample.value);
            const b = sweepPoint(cx, cy, reach, next.value);
            return <Path key={i} path={`M${cx} ${cy}L${a.x} ${a.y}L${b.x} ${b.y}Z`} color={sample.color} opacity={sample.opacity * 0.5} />;
          })}
          <Bloom radius={3}>
            {trail.slice(-1).map((sample) => (
              <Line key="live" p1={vec(cx, cy)} p2={vec(sweepPoint(cx, cy, reach, sample.value).x, sweepPoint(cx, cy, reach, sample.value).y)} strokeWidth={1.5} color={sample.color} />
            ))}
          </Bloom>
        </Group>
      </Canvas>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
});
