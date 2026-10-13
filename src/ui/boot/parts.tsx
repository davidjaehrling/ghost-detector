import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, font, radius, size, space, type } from '../tokens';

// ---------- typed self-test ----------

// Number of characters revealed so far, at `cps` characters per second.
// When `instant` is set there is no timer and everything is shown at once.
export function useTyped(total: number, cps: number, instant: boolean): number {
  const [n, setN] = useState(instant ? total : 0);
  useEffect(() => {
    if (instant) return;
    const start = Date.now();
    const id = setInterval(() => {
      const next = Math.min(total, Math.floor(((Date.now() - start) * cps) / 1000));
      setN(next);
      if (next >= total) clearInterval(id);
    }, 25);
    return () => clearInterval(id);
  }, [total, cps, instant]);
  return n;
}

// ---------- screws ----------

const screwAngles = [0, 38, 14, 62];

export function Screw({ corner, burred = false }: { corner: 0 | 1 | 2 | 3; burred?: boolean }) {
  const a = burred ? 24 : screwAngles[corner];
  return (
    <View style={[st.screw, corner === 0 && st.tl, corner === 1 && st.tr, corner === 2 && st.bl, corner === 3 && st.br]}>
      <View style={[st.slotWrap, { transform: [{ rotate: `${a}deg` }] }]}>
        <View style={st.slotH} />
        <View style={st.slotV} />
      </View>
      {burred ? <View style={st.notch} /> : null}
    </View>
  );
}

export function TinyScrew({ style }: { style: object }) {
  return (
    <View style={[st.tiny, style]}>
      <View style={st.tinySlot} />
    </View>
  );
}

// ---------- graticule ----------

// Thin p1 lines on a space.div grid, centred, filling the whole glass.
export function Graticule({ w, h }: { w: number; h: number }) {
  if (w <= 0 || h <= 0) return null;
  const cx = w / 2;
  const cy = h / 2;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = -Math.floor(cx / space.div); k <= Math.floor(cx / space.div); k++) xs.push(cx + k * space.div);
  for (let k = -Math.floor(cy / space.div); k <= Math.floor(cy / space.div); k++) ys.push(cy + k * space.div);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {xs.map((x) => (
        <View key={`x${x}`} style={[st.gridV, { left: x }, x === cx && st.axis]} />
      ))}
      {ys.map((y) => (
        <View key={`y${y}`} style={[st.gridH, { top: y }, y === cy && st.axis]} />
      ))}
    </View>
  );
}

// ---------- LED ladder ----------

// Boot state: LED 1 (bottom) lit at p3 with bloom; 2 to 5 unlit.
export function LedLadder() {
  const leds = [0, 1, 2, 3, 4];
  return (
    <View style={st.plate}>
      <TinyScrew style={{ top: 3 }} />
      <View style={st.ledCol}>
        {leds.map((i) => {
          const lit = i === 0;
          return (
            <View key={i} style={st.ledSlot}>
              {lit ? <View style={st.bloom} /> : null}
              <View style={[st.led, { backgroundColor: lit ? color.p3 : color.n2 }]}>
                {!lit && i < 4 ? <View style={st.spec} /> : null}
              </View>
            </View>
          );
        })}
      </View>
      <TinyScrew style={{ bottom: 3 }} />
    </View>
  );
}

// ---------- calibration sticker ----------

const copy = {
  head1: 'SIMULATION UNIT ·',
  head2: 'ENTERTAINMENT USE ONLY.',
  body: 'All readings are generated in software. This unit detects nothing.',
  meta1: 'VELDEN FS-4/87-P · FS4-8711-00417-6',
  meta2: 'CAL 2026-10-13 · DUE 2027-10 · PRÜF',
  stamp: '07',
};

export function Sticker({ style }: { style?: object }) {
  return (
    <View style={[st.sticker, style]}>
      <Text style={st.head}>{copy.head1}</Text>
      <Text style={st.head}>{copy.head2}</Text>
      <Text style={st.body}>{copy.body}</Text>
      <Text style={st.meta}>{copy.meta1}</Text>
      <View style={st.metaRow}>
        <Text style={st.meta}>{copy.meta2}</Text>
        <View style={st.stampRing}>
          <Text style={st.stamp}>{copy.stamp}</Text>
        </View>
      </View>
      <View style={st.liftShadow} />
      <View style={st.liftFlap} />
    </View>
  );
}

// The same sticker shrunk to 64 x 30 for the housing.
export function MiniSticker() {
  return (
    <View testID="sticker-mini" style={st.mini} accessibilityLabel="Calibration sticker. Simulation unit, entertainment use only.">
      <View style={st.miniInner} pointerEvents="none">
        <Sticker style={{ width: 290 }} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screw: {
    position: 'absolute',
    width: size.screw,
    height: size.screw,
    borderRadius: size.screw / 2,
    backgroundColor: color.n4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tl: { left: -12, top: -12 },
  tr: { right: -12, top: -12 },
  bl: { left: -12, bottom: -12 },
  br: { right: -12, bottom: -12 },
  slotWrap: { width: 6, height: 6, alignItems: 'center', justifyContent: 'center' },
  slotH: { position: 'absolute', width: 6, height: 1, backgroundColor: color.n2 },
  slotV: { position: 'absolute', width: 1, height: 6, backgroundColor: color.n2 },
  notch: { position: 'absolute', top: 1, left: 2, width: 3, height: 1, backgroundColor: color.n5 },
  tiny: {
    position: 'absolute',
    alignSelf: 'center',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.n4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tinySlot: { width: 3, height: 1, backgroundColor: color.n2 },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: color.p1, opacity: 0.6 },
  gridH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: color.p1, opacity: 0.6 },
  axis: { opacity: 1 },
  plate: {
    width: 28,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.n3,
    borderRadius: radius.plate,
    borderWidth: 1,
    borderColor: color.n4,
    borderBottomColor: color.n1,
  },
  ledCol: { flexDirection: 'column-reverse' },
  ledSlot: { width: 22, height: size.ledPitch, alignItems: 'center', justifyContent: 'center' },
  bloom: {
    position: 'absolute',
    width: size.led + 6,
    height: size.led + 6,
    borderRadius: (size.led + 6) / 2,
    backgroundColor: color.p3,
    opacity: 0.35,
  },
  led: { width: size.led, height: size.led, borderRadius: size.led / 2 },
  spec: { position: 'absolute', left: 2, top: 2, width: 2, height: 2, borderRadius: 1, backgroundColor: color.n4 },
  sticker: {
    backgroundColor: color.paper,
    paddingHorizontal: 10,
    paddingVertical: 10,
    transform: [{ rotate: '-1.5deg' }],
  },
  head: { fontFamily: font.labelBold, fontSize: 14, lineHeight: 18, letterSpacing: 0, color: color.ink },
  body: { ...type.lbS, letterSpacing: 0.3, color: color.ink, marginTop: space.unit },
  meta: { ...type.lbXS, letterSpacing: 0.6, color: color.ink, marginTop: space.unit * 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  stampRing: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 3,
    marginTop: space.unit * 2,
  },
  stamp: { fontFamily: font.labelBold, fontSize: 6, lineHeight: 8, letterSpacing: 0, color: color.ink },
  liftShadow: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 16,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderBottomColor: color.n1,
  },
  liftFlap: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 14,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderBottomColor: color.paper,
  },
  mini: { width: 64, height: 30, alignItems: 'center', justifyContent: 'center' },
  miniInner: { width: 290, alignItems: 'center', transform: [{ scale: 64 / 290 }] },
});
