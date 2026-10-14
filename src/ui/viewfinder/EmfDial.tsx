import { fmtFixed, getLocale, t, useLocale } from '../../i18n';
import { Canvas, Path, Skia, vec } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useFrameCallback, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { PHOSPHOR, TAU, effectiveTau, withAlpha } from '../../fx/glass';
import { color, needle, type } from '../tokens';
import { DIAL_H, DIAL_R, DIAL_W, GEO_LABEL, PIVOT, labelBoxes } from './dialLabels';
import { ARC_DEG, GEO_HIGH, GEO_LOW, fluxAngle } from './flux';

// Small EMF dial for the viewfinder HUD (Bible section 3): 100 degree log arc,
// majors at 10 20 50 100 200 500 1000 2000, minors at 2 to 9 of each decade, a GEO band
// arc on the inner edge, and a thin needle on the Bible's live spring. The scale is plain
// views and the GEO arc a Skia canvas drawn once. The needle, its shadow and its phosphor
// afterglow are views turned by reanimated shared values: the spring and the afterglow run
// without a React render or a canvas redraw per frame (P3-09). The afterglow is three copies
// that lag the needle by TAU.trace / 3, 2/3 and 1 (exponential follow) in p3, p2 and p1.
// `frozen` (harness) sets the angle without animating and leaves only the live needle.

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

/** Afterglow copies: lag (fraction of tau), colour step, opacity. */
const GLOW = [
  { lag: 1 / 3, step: 3, opacity: 0.75 },
  { lag: 2 / 3, step: 2, opacity: 0.6 },
  { lag: 1, step: 1, opacity: 0.55 },
] as const;

const tip = (deg: number, len: number) => {
  const a = (deg * Math.PI) / 180;
  return vec(PX + len * Math.sin(a), PY - len * Math.cos(a));
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
  const target = Math.max(-STOP, Math.min(STOP, angle));
  const deg = useSharedValue(target);
  const g0 = useSharedValue(target);
  const g1 = useSharedValue(target);
  const g2 = useSharedValue(target);
  const tau = effectiveTau(TAU.trace, reduceMotion);

  useEffect(() => {
    if (frozen) {
      deg.set(target);
      g0.set(target);
      g1.set(target);
      g2.set(target);
      return;
    }
    const damping = reduceMotion ? 2 * Math.sqrt(needle.live.stiffness * needle.live.mass) : needle.live.damping;
    deg.set(withSpring(target, { mass: needle.live.mass, stiffness: needle.live.stiffness, damping }));
  }, [target, frozen, reduceMotion, deg, g0, g1, g2]);

  // Afterglow: each copy follows the needle with its own time constant.
  const glow = useFrameCallback((info) => {
    'worklet';
    const dt = Math.max(0, Math.min(100, info.timeSincePreviousFrame ?? 0));
    const d = Math.max(-STOP, Math.min(STOP, deg.get()));
    g0.set(g0.get() + (d - g0.get()) * (1 - Math.exp(-dt / (tau * GLOW[0].lag))));
    g1.set(g1.get() + (d - g1.get()) * (1 - Math.exp(-dt / (tau * GLOW[1].lag))));
    g2.set(g2.get() + (d - g2.get()) * (1 - Math.exp(-dt / (tau * GLOW[2].lag))));
  }, false);
  useEffect(() => {
    glow.setActive(!frozen);
  }, [glow, frozen]);

  return (
    <View style={s.dial} pointerEvents="none">
      <Scale />
      <View style={s.canvas} pointerEvents="none" testID="emf-needle" aria-valuetext={t('a11y.deg', { n: fmtFixed(target, 1, getLocale()) })}>
        <GeoArc />
        {frozen ? null : (
          <>
            <Hand value={g2} step={GLOW[2].step} opacity={GLOW[2].opacity} />
            <Hand value={g1} step={GLOW[1].step} opacity={GLOW[1].opacity} />
            <Hand value={g0} step={GLOW[0].step} opacity={GLOW[0].opacity} />
          </>
        )}
        <Hand value={deg} step={1} opacity={1} width={3} dx={2} dy={2} />
        <Hand value={deg} step={4} opacity={1} bloom />
        <View style={s.hub} />
      </View>
    </View>
  );
}

// One needle line about the pivot, turned by `value` (degrees, clamped to the stops). The view is
// a square centred on the pivot, so its own rotation is the needle's.
function Hand({ value, step, opacity, width = 1.5, dx = 0, dy = 0, bloom = false }: { value: SharedValue<number>; step: number; opacity: number; width?: number; dx?: number; dy?: number; bloom?: boolean }) {
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${Math.max(-STOP, Math.min(STOP, value.get()))}deg` }] }));
  const c = PHOSPHOR[step as 0 | 1 | 2 | 3 | 4 | 5];
  const L = NEEDLE_LEN;
  return (
    <Animated.View style={[s.hand, { left: PX + dx - L, top: PY + dy - L, width: 2 * L, height: 2 * L, opacity }, spin]}>
      {bloom ? <View style={[s.line, { left: L - 2.5, width: 5, height: L + 1, backgroundColor: withAlpha(c, 0.22) }]} /> : null}
      <View style={[s.line, { left: L - width / 2, width, height: L, backgroundColor: c }]} />
    </Animated.View>
  );
}

// The scale never changes: ticks, labels and the GEO legend, rendered once.
const Scale = memo(function Scale() {
  useLocale();
  return (
    <>
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
      <Text style={[s.geo, { left: GEO_LABEL.left, top: GEO_LABEL.top, width: GEO_LABEL.width }]}>{t('viewfinder.geoLabel')}</Text>
    </>
  );
});

// The GEO band arc on the inner edge: one canvas, drawn once.
const GeoArc = memo(function GeoArc() {
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
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path path={geoPath} style="stroke" strokeWidth={3} color={color.p2} />
    </Canvas>
  );
});

const s = StyleSheet.create({
  dial: { width: DIAL_W, height: DIAL_H },
  pivot: { position: 'absolute', width: 0, height: 0 },
  major: { position: 'absolute', left: -0.75, top: -R, width: 1.5, height: 9, backgroundColor: color.p3 },
  minor: { position: 'absolute', left: -0.5, top: -R, width: 1, height: 5, backgroundColor: color.p2 },
  label: { ...type.rdXS, position: 'absolute', height: 16, lineHeight: 16, textAlign: 'center', color: color.p3 },
  geo: { ...type.lbXS, position: 'absolute', textAlign: 'center', color: color.p3 },
  canvas: { position: 'absolute', left: 0, top: 0, width: DIAL_W, height: DIAL_H },
  hand: { position: 'absolute' },
  line: { position: 'absolute', top: 0 },
  hub: { position: 'absolute', left: PX - 4, top: PY - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: color.n4 },
});
