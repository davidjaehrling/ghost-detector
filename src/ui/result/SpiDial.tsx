import { Animated, StyleSheet, Text, View } from 'react-native';
import { color, type } from '../tokens';

// Small SPI dial (Bible section 3): linear 0 to 100 over a 100 degree arc, major
// ticks at the tier bounds 20 45 70 90 (uneven because the tiers are), minors
// every 5. The needle follows an Animated.Value in SPI units.

export const SPI_DIAL_W = 150;
export const SPI_DIAL_H = 90;
const R = 60;
const PX = SPI_DIAL_W / 2;
const PY = 82;
const ARC = 100;

export const spiAngle = (spi: number) => (Math.min(100, Math.max(0, spi)) / 100 - 0.5) * ARC;

const MAJORS = [0, 20, 45, 70, 90, 100];
const TICKS = Array.from({ length: 21 }, (_, i) => i * 5);
const toRad = (deg: number) => (deg * Math.PI) / 180;
const at = (deg: number, r: number) => ({ x: PX + r * Math.sin(toRad(deg)), y: PY - r * Math.cos(toRad(deg)) });

export function SpiDial({ value, redZone }: { value: Animated.Value; redZone: boolean }) {
  const rotate = value.interpolate({ inputRange: [0, 100], outputRange: [`${-ARC / 2}deg`, `${ARC / 2}deg`] });
  const lo = at(spiAngle(0), R + 11);
  const hi = at(spiAngle(100), R + 11);
  return (
    <View style={s.dial} pointerEvents="none" testID="result-dial">
      {TICKS.map((t) => {
        const major = MAJORS.includes(t);
        const hot = t === 90 && redZone;
        return (
          <View key={t} style={[s.pivot, { left: PX, top: PY, transform: [{ rotate: `${spiAngle(t)}deg` }] }]}>
            <View style={[major ? s.major : s.minor, hot && s.hot]} />
          </View>
        );
      })}
      <Text style={[s.label, { left: lo.x - 20, top: lo.y - 9 }]}>0</Text>
      <Text style={[s.label, { left: hi.x - 20, top: hi.y - 9 }]}>100</Text>
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
  dial: { width: SPI_DIAL_W, height: SPI_DIAL_H },
  pivot: { position: 'absolute', width: 0, height: 0 },
  major: { position: 'absolute', left: -0.75, top: -R, width: 1.5, height: 9, backgroundColor: color.p3 },
  minor: { position: 'absolute', left: -0.5, top: -R, width: 1, height: 5, backgroundColor: color.p2 },
  hot: { backgroundColor: color.red },
  label: { ...type.rdXS, position: 'absolute', width: 40, textAlign: 'center', color: color.p3 },
  needle: { position: 'absolute', left: -0.75, top: -(R - 4), width: 1.5, height: R - 4, backgroundColor: color.p4 },
  needleShadow: { position: 'absolute', left: -1.5, top: -(R - 4), width: 3, height: R - 4, backgroundColor: color.p1 },
  hub: { position: 'absolute', left: PX - 4, top: PY - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: color.n4 },
});
