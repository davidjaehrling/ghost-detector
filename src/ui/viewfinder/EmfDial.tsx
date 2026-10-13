import { Canvas, Circle, Line, Path, Skia, vec } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Bloom, TAU, usePersistence } from '../../fx/glass';
import { color, needle, type } from '../tokens';
import { DIAL_H, DIAL_R, DIAL_W, GEO_LABEL, PIVOT, labelBoxes } from './dialLabels';
import { ARC_DEG, GEO_HIGH, GEO_LOW, fluxAngle } from './flux';

// Small EMF dial for the viewfinder HUD (Bible section 3): 100 degree log arc,
// majors at 10 20 50 100 200 500 1000 2000, minors at 2 to 9 of each decade, a GEO band
// arc on the inner edge, and a thin needle on the Bible's live spring. The scale is plain
// views; the GEO arc, the needle and its phosphor trail are drawn in Skia with the
// persistence of TAU.trace and a bloom. `frozen` (harness) sets the angle without animating
// and leaves only the live needle.

export { DIAL_H, DIAL_W };
const R = DIAL_R;
const PX = PIVOT.x;
const PY = PIVOT.y;
const NEEDLE_LEN = R - 4;
const GEO_R = R - 12;
// Hard stops sit a little past the arc ends (Bible section 6).
const STOP = ARC_DEG / 2 + 3;

const MAJORS = [10, 20, 50, 100, 200, 500, 1000, 2000];
const LABEL_BOXES = labelBoxes();
const TICKS: number[] = [];
for (const dec of [10, 100]) for (let k = 1; k <= 9; k++) TICKS.push(dec * k);
TICKS.push(1000, 2000);

const tip = (deg: number, len: number, dx = 0, dy = 0) => {
  const a = (deg * Math.PI) / 180;
  return vec(PX + dx + len * Math.sin(a), PY + dy - len * Math.cos(a));
};

export function EmfDial({
  angle,
  frozen,
  reduceMotion,
}: {
  /** Target needle angle in degrees from straight up. */
  angle: number;
  frozen: boolean;
  reduceMotion: boolean;
}) {
  const [value] = useState(() => new Animated.Value(angle));
  const [deg, setDeg] = useState(angle);
  useEffect(() => {
    const id = value.addListener(({ value: v }) => {
      setDeg(v);
    });
    return () => value.removeListener(id);
  }, [value]);
  useEffect(() => {
    if (frozen) {
      value.setValue(angle);
      return;
    }
    const damping = reduceMotion ? 2 * Math.sqrt(needle.live.stiffness * needle.live.mass) : needle.live.damping;
    // JS driver: the needle is drawn in Skia from the value, frame by frame.
    const anim = Animated.spring(value, {
      toValue: angle,
      mass: needle.live.mass,
      stiffness: needle.live.stiffness,
      damping,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [angle, frozen, reduceMotion, value]);

  const shown = Math.max(-STOP, Math.min(STOP, deg));
  const trail = usePersistence(Math.round(shown * 10) / 10, { tau: TAU.trace, step: 4, static: frozen, reduceMotion });

  const geoPath = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    const a0 = fluxAngle(GEO_LOW);
    const a1 = fluxAngle(GEO_HIGH);
    for (let a = a0; a <= a1 + 1e-6; a += 1) {
      const pt = tip(Math.min(a, a1), GEO_R);
      if (a === a0) p.moveTo(pt.x, pt.y);
      else p.lineTo(pt.x, pt.y);
    }
    return p.detach();
  }, []);

  return (
    <View style={s.dial} pointerEvents="none">
      {TICKS.map((mg) => {
        const major = MAJORS.includes(mg);
        return (
          <View key={mg} style={[s.pivot, { left: PX, top: PY, transform: [{ rotate: `${fluxAngle(mg)}deg` }] }]}>
            <View style={major ? s.major : s.minor} />
          </View>
        );
      })}
      {LABEL_BOXES.map((b) => (
        <Text key={b.mg} style={[s.label, { left: b.left, top: b.top, width: b.width }]}>
          {b.text}
        </Text>
      ))}
      <Text style={[s.geo, { left: GEO_LABEL.left, top: GEO_LABEL.top, width: GEO_LABEL.width }]}>GEO</Text>
      <View style={s.canvas} pointerEvents="none" testID="emf-needle" aria-valuetext={`${shown.toFixed(1)} deg`}>
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path path={geoPath} style="stroke" strokeWidth={2} color={color.p2} />
        <Line p1={vec(PX + 2, PY + 2)} p2={tip(shown, NEEDLE_LEN, 2, 2)} strokeWidth={3} color={color.p1} />
        <Bloom radius={3}>
          {trail.map((sample, i) => (
            <Line key={i} p1={vec(PX, PY)} p2={tip(sample.value, NEEDLE_LEN)} strokeWidth={1.5} color={sample.color} opacity={sample.opacity} />
          ))}
        </Bloom>
        <Circle cx={PX} cy={PY} r={4} color={color.n4} />
      </Canvas>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  dial: { width: DIAL_W, height: DIAL_H },
  pivot: { position: 'absolute', width: 0, height: 0 },
  major: { position: 'absolute', left: -0.75, top: -R, width: 1.5, height: 9, backgroundColor: color.p3 },
  minor: { position: 'absolute', left: -0.5, top: -R, width: 1, height: 5, backgroundColor: color.p2 },
  label: { ...type.rdXS, position: 'absolute', height: 16, lineHeight: 16, textAlign: 'center', color: color.p3 },
  geo: { ...type.lbXS, position: 'absolute', textAlign: 'center', color: color.p3 },
  canvas: { position: 'absolute', left: 0, top: 0, width: DIAL_W, height: DIAL_H },
});
