import { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { color, needle, type } from '../tokens';
import { DIAL_H, DIAL_R, DIAL_W, GEO_LABEL, PIVOT, labelBoxes } from './dialLabels';
import { ARC_DEG, GEO_HIGH, GEO_LOW, fluxAngle } from './flux';

// Small EMF dial for the viewfinder HUD (Bible section 3): 100 degree log arc,
// majors at 10 20 50 100 200 500 1000 2000, minors at 2 to 9 of each decade,
// GEO band on the inner edge, thin needle on the Bible's live spring.
// `frozen` (harness) sets the angle without animating.

export { DIAL_H, DIAL_W };
const R = DIAL_R;
const PX = PIVOT.x;
const PY = PIVOT.y;

const MAJORS = [10, 20, 50, 100, 200, 500, 1000, 2000];
const LABEL_BOXES = labelBoxes();
const TICKS: number[] = [];
for (const dec of [10, 100]) for (let k = 1; k <= 9; k++) TICKS.push(dec * k);
TICKS.push(1000, 2000);


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
  useEffect(() => {
    if (frozen) {
      value.setValue(angle);
      return;
    }
    const damping = reduceMotion ? 2 * Math.sqrt(needle.live.stiffness * needle.live.mass) : needle.live.damping;
    const anim = Animated.spring(value, {
      toValue: angle,
      mass: needle.live.mass,
      stiffness: needle.live.stiffness,
      damping,
      useNativeDriver: Platform.OS !== 'web',
    });
    anim.start();
    return () => anim.stop();
  }, [angle, frozen, reduceMotion, value]);

  const rotate = value.interpolate({
    inputRange: [-ARC_DEG / 2 - 20, ARC_DEG / 2 + 20],
    outputRange: [`${-ARC_DEG / 2 - 20}deg`, `${ARC_DEG / 2 + 20}deg`],
  });
  const geo0 = fluxAngle(GEO_LOW);
  const geo1 = fluxAngle(GEO_HIGH);
  const geoSegs = Math.ceil((geo1 - geo0) / 3.5);

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
      {Array.from({ length: geoSegs }, (_, i) => {
        const a = geo0 + ((i + 0.5) * (geo1 - geo0)) / geoSegs;
        return (
          <View key={`g${i}`} style={[s.pivot, { left: PX, top: PY, transform: [{ rotate: `${a}deg` }] }]}>
            <View style={s.geoSeg} />
          </View>
        );
      })}
      {LABEL_BOXES.map((b) => (
        <Text key={b.mg} style={[s.label, { left: b.left, top: b.top, width: b.width }]}>
          {b.text}
        </Text>
      ))}
      <Text style={[s.geo, { left: GEO_LABEL.left, top: GEO_LABEL.top, width: GEO_LABEL.width }]}>GEO</Text>
      <Animated.View style={[s.pivot, { left: PX + 2, top: PY + 2, transform: [{ rotate }] }]}>
        <View style={s.needleShadow} />
      </Animated.View>
      <Animated.View style={[s.pivot, { left: PX, top: PY, transform: [{ rotate }] }]}>
        <View style={s.needle} />
      </Animated.View>
      <View style={s.hub} />
    </View>
  );
}

const s = StyleSheet.create({
  dial: { width: DIAL_W, height: DIAL_H },
  pivot: { position: 'absolute', width: 0, height: 0 },
  major: { position: 'absolute', left: -0.75, top: -R, width: 1.5, height: 9, backgroundColor: color.p3 },
  minor: { position: 'absolute', left: -0.5, top: -R, width: 1, height: 5, backgroundColor: color.p2 },
  geoSeg: { position: 'absolute', left: -2, top: -(R - 12), width: 4, height: 2, backgroundColor: color.p1 },
  label: { ...type.rdXS, position: 'absolute', height: 16, lineHeight: 16, textAlign: 'center', color: color.p3 },
  geo: { ...type.lbXS, position: 'absolute', textAlign: 'center', color: color.p3 },
  needle: { position: 'absolute', left: -0.75, top: -(R - 4), width: 1.5, height: R - 4, backgroundColor: color.p4 },
  needleShadow: { position: 'absolute', left: -1.5, top: -(R - 4), width: 3, height: R - 4, backgroundColor: color.p1 },
  hub: { position: 'absolute', left: PX - 4, top: PY - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: color.n4 },
});
