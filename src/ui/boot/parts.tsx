import { useEffect, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { color, font, radius, size, space, type } from '../tokens';
import { KEY_GUTTER, KEY_SLOTS, KEY_W, keyLayout, legendFit } from '../keyLayout';
import { stickerShowsSerial } from '../serial';
import { GRID_TOP } from './layout';
import { mulberry32 } from './seed';
import { copyOf } from '../../i18n';

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

// ---------- blink ----------

// 500 ms on, 500 ms off. With `still` (harness) it stays on.
export function useBlink(still: boolean): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (still) return;
    const id = setInterval(() => setOn((v) => !v), 500);
    return () => clearInterval(id);
  }, [still]);
  return on || still;
}

// ---------- screws ----------

const screwAngles = [0, 38, 14, 62];

// 10 px bezel screw. Placed by the parent in the bezel margin so it clears the
// glass and the nameplate.
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

const PLATE_SCREW = 6;

export function PlateScrew({ style }: { style: object }) {
  return (
    <View style={[st.tiny, style]}>
      <View style={st.tinySlot} />
    </View>
  );
}

// ---------- thumb wear ----------

// Paint rubbed through to n4 where thumbs grip: a tapered 1 to 2 px streak,
// low alpha. `side` picks the housing edge.
export function Wear({ side, top, length }: { side: 'left' | 'right'; top: `${number}%`; length: number }) {
  const end = Math.round(length * 0.25);
  const mid = length - end * 2;
  return (
    <View pointerEvents="none" style={[st.wear, side === 'left' ? { left: 0 } : { right: 0 }, { top }]}>
      <View style={[st.wearSeg, { height: end, width: 1, opacity: 0.12 }]} />
      <View style={[st.wearSeg, { height: mid, width: 2, opacity: 0.24 }]} />
      <View style={[st.wearSeg, { height: end, width: 1, opacity: 0.12 }]} />
    </View>
  );
}

// ---------- graticule ----------

// Bible section 3: 10 x 8 divisions, centred horizontally, top-aligned 24 px
// under the glass edge. Grid lines are solid p1 at 40% (a 1-on-3 dash would need
// more than 600 views). Centre axes are solid with 4 px minor ticks.
export const GRID_COLS = 10;
export const GRID_ROWS = 8;
export { GRID_TOP };

// The grid keeps 4 px of tube on each side, so the corner text never meets the glass edge.
export const GRID_SIDE = 4;

export function gridDiv(glassW: number): number {
  if (glassW <= 0) return space.div;
  return Math.min(space.div, Math.floor((glassW - 2 * GRID_SIDE) / GRID_COLS));
}

// `rows` is the Bible's 8 unless a screen with spare height asks for more (the scan theatre).
export function Graticule({ w, h, rows: rowCount = GRID_ROWS }: { w: number; h: number; rows?: number }) {
  if (w <= 0 || h <= 0) return null;
  const div = gridDiv(w);
  const gw = div * GRID_COLS;
  const gh = div * rowCount;
  const left = Math.round((w - gw) / 2);
  const cx = gw / 2;
  const cy = gh / 2;
  const cols = Array.from({ length: GRID_COLS + 1 }, (_, k) => k * div);
  const rows = Array.from({ length: rowCount + 1 }, (_, k) => k * div);
  const step = div / 5;
  const hTicks: number[] = [];
  const vTicks: number[] = [];
  for (let k = 0; k < GRID_COLS * 5; k++) if (k % 5 !== 0) hTicks.push(k * step);
  for (let k = 0; k < rowCount * 5; k++) if (k % 5 !== 0) vTicks.push(k * step);
  return (
    <View pointerEvents="none" style={[st.grid, { left, top: GRID_TOP, width: gw, height: gh }]}>
      {cols.map((x) => (
        <View key={`x${x}`} style={[st.gridV, { left: x }, x === cx && st.axis]} />
      ))}
      {rows.map((y) => (
        <View key={`y${y}`} style={[st.gridH, { top: y }, y === cy && st.axis]} />
      ))}
      {hTicks.map((x) => (
        <View key={`hx${x}`} style={[st.tickH, { left: Math.round(x), top: cy - 2 }]} />
      ))}
      {vTicks.map((y) => (
        <View key={`vy${y}`} style={[st.tickV, { top: Math.round(y), left: cx - 2 }]} />
      ))}
    </View>
  );
}

// Flat idle trace on the horizontal centre axis, p4, with seeded 1 to 2 px jitter.
export function IdleTrace({ w, seed, rows = GRID_ROWS }: { w: number; seed: number; rows?: number }) {
  if (w <= 0) return null;
  const div = gridDiv(w);
  const gw = div * GRID_COLS;
  const left = Math.round((w - gw) / 2);
  const cy = GRID_TOP + (div * rows) / 2;
  const r = mulberry32(seed);
  const seg = 6;
  const n = Math.ceil(gw / seg);
  const segs = Array.from({ length: n }, (_, i) => ({
    x: i * seg,
    dy: Math.round((r() * 2 - 1) * 1.5 * 2) / 2,
  }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {segs.map(({ x, dy }) => (
        <View key={x} style={[st.trace, { left: left + x, top: cy - 0.75 + dy, width: Math.min(seg, gw - x) }]} />
      ))}
    </View>
  );
}

// Text outside the grid: firmware line and trigger label above it, timebase below.
export function GridLabels({ w, fw, trig, tb, sens, rows = GRID_ROWS }: { w: number; fw: string; trig: string; tb: string; sens?: string; rows?: number }) {
  const div = gridDiv(w);
  const gw = div * GRID_COLS;
  const left = Math.round((w - gw) / 2);
  return (
    <>
      <Text style={[st.cornerText, { left, top: 3 }]}>{fw}</Text>
      <Text style={[st.cornerText, { right: left, top: 3 }]}>{trig}</Text>
      <Text style={[st.cornerText, { left, top: GRID_TOP + div * rows + 3 }]}>{tb}</Text>
      {sens ? <Text style={[st.cornerText, { right: left, top: GRID_TOP + div * rows + 3 }]}>{sens}</Text> : null}
    </>
  );
}

// ---------- LED ladder ----------

// Bible section 3: lit LEDs differ by brightness only (p3, p4, p4, p5, then red
// for CRITICAL). `lit` counts from the bottom; boot shows only the power LED.
const LED_COLORS = [color.p3, color.p4, color.p4, color.p5, color.red] as const;

export function LedLadder({ lit: litCount = 1 }: { lit?: number }) {
  const leds = [0, 1, 2, 3, 4];
  return (
    <View style={st.plate}>
      <PlateScrew style={{ top: 2 }} />
      <View style={st.ledCol}>
        {leds.map((i) => {
          const lit = i < Math.max(1, litCount);
          const hue = LED_COLORS[i]!;
          return (
            <View key={i} style={st.ledSlot}>
              {lit ? <View style={[st.bloom, { backgroundColor: hue }]} /> : null}
              <View style={[st.led, { backgroundColor: lit ? hue : color.n2 }]}>
                {!lit && i < 4 ? <View style={st.spec} /> : null}
              </View>
            </View>
          );
        })}
      </View>
      <PlateScrew style={{ bottom: 2 }} />
    </View>
  );
}

// ---------- calibration sticker ----------

const copy = copyOf({
  head1: 'sticker.head1',
  head2: 'sticker.head2',
  body: 'sticker.body',
  model: 'sticker.model',
});

const FOLD = 16;

// Bible section 11. `meta` data comes from the install identity. The lower
// right corner is lifted: the corner is cut away over `bg`, the folded flap
// shows the darker underside, and a 2 px shadow line lies along the crease.
export function Sticker({
  serial,
  cal,
  pruef,
  bg = color.n0,
  style,
  onLayout,
}: {
  serial: string;
  cal: string;
  pruef: string;
  bg?: string;
  style?: object;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  // One line; the segments wrap whole when the glass is too narrow for it. The serial rule
  // (src/ui/serial.ts) prints the full serial here only when the nameplate carries the short form.
  const { width } = useWindowDimensions();
  const parts = [copy.model, ...(stickerShowsSerial(width) ? [serial] : []), `CAL ${cal}`, `PRÜF ${pruef}`];
  const line = parts.join(' · ');
  const segments = parts.map((t, i) => (i < parts.length - 1 ? `${t} · ` : t));
  return (
    <View style={[st.sticker, style]} onLayout={onLayout}>
      <Text style={st.head}>{copy.head1}</Text>
      <Text style={st.head}>{copy.head2}</Text>
      <Text style={st.body}>{copy.body}</Text>
      <View style={st.meta} accessibilityLabel={line}>
        {segments.map((t) => (
          <Text key={t} style={st.metaText}>
            {t}
          </Text>
        ))}
      </View>
      <View style={[st.cut, { borderBottomColor: bg }]} />
      <View style={st.flap} />
      <View style={st.crease} />
    </View>
  );
}

// The same sticker, smaller, stuck on the housing for the life of the install (Bible sections 2
// and 11): bottom-left under the window, tilted -1.5 degrees, lower right corner lifted. It prints
// the two disclosure heading lines and the calibration line, each on its own row and never cut:
// the paper is as wide as its longest line.
export const MINI_STICKER_H = 41;

export function MiniSticker({ cal, pruef, bg = color.n3, style }: { cal: string; pruef: string; bg?: string; style?: object }) {
  const meta = `CAL ${cal} · PRÜF ${pruef}`;
  return (
    <View style={[st.mini, style]} pointerEvents="none" testID="sticker-mini" accessibilityLabel={`${copy.head1} ${copy.head2} ${meta}`}>
      <Text style={st.miniHead} numberOfLines={1}>
        {copy.head1}
      </Text>
      <Text style={st.miniHead} numberOfLines={1}>
        {copy.head2}
      </Text>
      <Text style={st.miniMeta} numberOfLines={1}>
        {meta}
      </Text>
      <View style={[st.miniCut, { borderBottomColor: bg }]} />
      <View style={st.miniFlap} />
    </View>
  );
}

// ---------- key row ----------

// One fixed four-slot key row (D-007 item 1). Every screen uses the same four
// 72 x 44 caps at the same x positions; a slot with no function is an engraved
// dummy cap. Slot 3 (far right) is the primary action.

export type KeySlot = {
  testID: string;
  label: string;
  legend: string;
  onPress: () => void;
  /** Engraved but not live: n4 legend, press does nothing. */
  inert?: boolean;
  /** The one offered action: p5 backlit legend and a 1 px p3 keyline. */
  primary?: boolean;
  /** Backlit legend: p5 text, no keyline. */
  backlit?: boolean;
};

export function KeyRow({ slots }: { slots: readonly (KeySlot | null)[] }) {
  const { width } = useWindowDimensions();
  const { gap, left } = keyLayout(width - KEY_GUTTER * 2);
  return (
    <View style={st.keyPlate}>
      <View style={[st.slotRow, { marginLeft: left, gap }]}>
        {Array.from({ length: KEY_SLOTS }, (_, i) => {
          const slot = slots[i];
          return slot ? <Key key={slot.testID} {...slot} /> : <DummyCap key={`d${i}`} />;
        })}
      </View>
    </View>
  );
}

// Blank moulded cap: same footprint as a live key, no legend and no glyph. The only mark is a 1 px
// recess ring inset from the edge, which reads as moulding and never as a dash, a dot or an icon.
// It is not focusable, has no label and takes no press.
export function DummyCap() {
  return (
    <View
      testID="key-dummy"
      style={st.dummy}
      pointerEvents="none"
      focusable={false}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={st.ring} />
    </View>
  );
}

// Rubber key: darker n2 face, 1 px n4 top highlight. Legend is lbM (Bible
// section 5 sets key legends at 13 px). Long legends wrap on the space.
export function Key({ testID, label, legend, onPress, inert = false, primary = false, backlit = false }: KeySlot) {
  const fit = legendFit(legend);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert }}
      onPress={inert ? undefined : onPress}
      style={({ pressed }) => [st.key, primary && st.keyPrimary, pressed && !inert && st.keyDown]}
    >
      <Text style={[st.keyLegend, fit, inert && st.keyLegendInert, (primary || backlit) && st.keyLegendPrimary]} numberOfLines={2}>
        {legend}
      </Text>
    </Pressable>
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
  tl: { left: -12, top: -14 },
  tr: { right: -12, top: -14 },
  bl: { left: -12, bottom: -14 },
  br: { right: -12, bottom: -14 },
  slotWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  slotH: { position: 'absolute', width: 8, height: 1, backgroundColor: color.n2 },
  slotV: { position: 'absolute', width: 1, height: 8, backgroundColor: color.n2 },
  notch: { position: 'absolute', top: 1, left: 2, width: 3, height: 1, backgroundColor: color.n5 },
  tiny: {
    position: 'absolute',
    alignSelf: 'center',
    width: PLATE_SCREW,
    height: PLATE_SCREW,
    borderRadius: PLATE_SCREW / 2,
    backgroundColor: color.n4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tinySlot: { width: 4, height: 1, backgroundColor: color.n2, transform: [{ rotate: '35deg' }] },
  wear: { position: 'absolute', alignItems: 'flex-start' },
  wearSeg: { backgroundColor: color.n4 },

  grid: { position: 'absolute' },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: color.p1, opacity: 0.4 },
  gridH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: color.p1, opacity: 0.4 },
  axis: { opacity: 1 },
  tickH: { position: 'absolute', width: 1, height: 4, backgroundColor: color.p1 },
  tickV: { position: 'absolute', height: 1, width: 4, backgroundColor: color.p1 },
  trace: { position: 'absolute', height: 1.5, backgroundColor: color.p4 },
  cornerText: { ...type.rdXS, position: 'absolute', color: color.p3 },


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
  head: { ...type.body, fontFamily: font.labelBold, lineHeight: 18, color: color.ink },
  body: { ...type.lbS, letterSpacing: 0.3, color: color.ink, marginTop: space.unit },
  meta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.unit * 2, paddingRight: FOLD },
  metaText: { ...type.lbXS, letterSpacing: 0.3, color: color.ink },
  cut: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    borderLeftWidth: FOLD,
    borderBottomWidth: FOLD,
    borderLeftColor: 'transparent',
  },
  flap: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    borderTopWidth: FOLD,
    borderRightWidth: FOLD,
    borderRightColor: 'transparent',
    borderTopColor: color.n6,
  },
  crease: {
    position: 'absolute',
    right: -4,
    bottom: 7,
    width: Math.round(FOLD * 1.414) + 2,
    height: 2,
    backgroundColor: color.ink,
    opacity: 0.45,
    transform: [{ rotate: '-45deg' }],
  },

  mini: {
    alignSelf: 'flex-start',
    backgroundColor: color.paper,
    paddingHorizontal: 7,
    paddingTop: 4,
    paddingBottom: 4,
    transform: [{ rotate: '-1.5deg' }],
  },
  miniHead: { ...type.lbXS, fontFamily: font.labelBold, lineHeight: 11, letterSpacing: 0.3, color: color.ink },
  miniMeta: { ...type.lbXS, lineHeight: 11, letterSpacing: 0.3, color: color.ink },
  miniCut: { position: 'absolute', right: 0, bottom: 0, width: 0, height: 0, borderLeftWidth: 7, borderBottomWidth: 7, borderLeftColor: 'transparent' },
  miniFlap: { position: 'absolute', right: 0, bottom: 0, width: 0, height: 0, borderTopWidth: 7, borderRightWidth: 7, borderRightColor: 'transparent', borderTopColor: color.n6 },

  keyPlate: {
    height: size.keyH + 12,
    justifyContent: 'center',
    backgroundColor: color.n1,
    borderRadius: radius.key,
    borderTopWidth: 1,
    borderTopColor: color.n0,
    borderBottomWidth: 1,
    borderBottomColor: color.n4,
  },
  slotRow: { flexDirection: 'row' },
  key: {
    width: KEY_W,
    height: size.keyH,
    borderRadius: radius.key,
    backgroundColor: color.n2,
    borderTopWidth: 1,
    borderTopColor: color.n4,
    borderBottomWidth: 3,
    borderBottomColor: color.n0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  keyPrimary: { outlineWidth: 1, outlineColor: color.p3, outlineStyle: 'solid', outlineOffset: 0 },
  keyDown: { borderBottomWidth: 1, borderTopWidth: 3, borderTopColor: color.n0 },
  keyLegend: { ...type.lbM, color: color.n6, opacity: 0.85, textAlign: 'center' },
  keyLegendPrimary: { color: color.p5, opacity: 1 },
  keyLegendInert: { color: color.n4, opacity: 1 },
  dummy: {
    width: KEY_W,
    height: size.keyH,
    borderRadius: radius.key,
    backgroundColor: color.n2,
    borderTopWidth: 1,
    borderTopColor: color.n4,
    borderBottomWidth: 3,
    borderBottomColor: color.n0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: { position: 'absolute', left: 5, right: 5, top: 5, bottom: 5, borderRadius: 3, borderWidth: 1, borderColor: color.n1 },
});
