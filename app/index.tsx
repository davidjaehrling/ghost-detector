import { useRouter } from 'expo-router';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activityIndex, daysToFullMoon } from '../src/ui/boot/activity';
import { FIXED_SEED, getInstallIdentity } from '../src/ui/boot/install';
import { type BootParams, readBootParams } from '../src/ui/boot/params';
import {
  BurnIn,
  GRID_COLS,
  GRID_ROWS,
  GRID_TOP,
  Graticule,
  GridLabels,
  IdleTrace,
  KeyRow,
  LedLadder,
  MiniSticker,
  Screw,
  Sticker,
  Wear,
  gridDiv,
  useTyped,
} from '../src/ui/boot/parts';
import { dayKey } from '../src/ui/boot/seed';
import { formatSelfTest, selfTestReadings } from '../src/ui/boot/selftest';
import { color, font, radius, space, type } from '../src/ui/tokens';

const copy = {
  maker: 'VELDEN  FS-4/87-P',
  firmware: 'FW 3.1.7 · ROM C2-8811',
  trig: 'TRIG AUTO',
  timebase: '50 ms/DIV',
  selftestOk: 'SELFTEST OK',
  actIdx: 'ACT IDX',
  moon: 'MOON',
  nextPeak: 'NEXT PEAK  FULL MOON',
  gauge10: '10',
  gauge100: '100',
  gauge1000: '1000',
  gaugeUnit: 'mG',
  key: 'ACK',
  keyLabel: 'Acknowledge',
};

const TYPE_CPS = 40;
// Per-launch variation for the seeded self-test readings.
const BOOT_NONCE = Date.now() % 100_000;
const STICKER_INSET = 8;

let cached: BootParams | null = null;
const clientParams = () => (cached ??= readBootParams());
const serverParams = () => null;
const subscribeNever = () => () => {};

// Query params exist only on the client, so the static export renders the
// empty housing and the body mounts after hydration (no hydration mismatch).
export default function BootScreen() {
  const params = useSyncExternalStore(subscribeNever, clientParams, serverParams);
  return params ? <Boot params={params} /> : <View testID="boot-screen" style={s.housing} />;
}

function Boot({ params: { isStatic, date, dated } }: { params: BootParams }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { index, moonPct } = activityIndex(date);
  const peakDays = daysToFullMoon(date);
  const fixed = isStatic || dated;
  const identity = useMemo(() => (fixed ? getInstallIdentity(date, FIXED_SEED) : getInstallIdentity(date)), [fixed, date]);
  const lines = useMemo(() => {
    const seed = fixed ? dayKey(date) : dayKey(date) ^ BOOT_NONCE;
    return [...selfTestReadings(seed).map(formatSelfTest), copy.selftestOk];
  }, [fixed, date]);
  const total = lines.reduce((n, l) => n + l.length, 0);
  const typed = useTyped(total, TYPE_CPS, isStatic);
  const [acknowledged, setAcknowledged] = useState(false);
  const [glassSize, setGlassSize] = useState({ w: 0, h: 0 });
  const onGlass = (e: LayoutChangeEvent) =>
    setGlassSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const shown = lines.map((l, i) => {
    const before = lines.slice(0, i).reduce((n, p) => n + p.length, 0);
    return l.slice(0, Math.max(0, Math.min(l.length, typed - before)));
  });
  const typing = typed < total;

  const div = gridDiv(glassSize.w);
  const gridLeft = Math.round((glassSize.w - div * GRID_COLS) / 2);
  const gridBottom = GRID_TOP + div * GRID_ROWS;

  const onAcknowledge = () => {
    setAcknowledged(true);
    router.push('/viewfinder');
  };

  return (
    <View testID="boot-screen" style={[s.housing, { paddingTop: insets.top + 12 }]}>
      <Wear side="left" top="44%" length={58} />
      <Wear side="right" top="62%" length={46} />

      <View style={s.nameplate}>
        <View style={[s.rivet, { left: 8 }]} />
        <Text style={s.plateText}>{copy.maker}</Text>
        <Text style={s.plateText}>{identity.serial}</Text>
        <View style={[s.rivet, { right: 8 }]} />
        <View style={s.scuff} />
      </View>

      <View style={s.windowRow}>
        <View style={s.windowWrap}>
          <View style={s.glass}>
            <View style={StyleSheet.absoluteFill} onLayout={onGlass} pointerEvents="none" />
            <BurnIn
              cx={Math.round(glassSize.w * 0.16)}
              cy={GRID_TOP + Math.round(div * GRID_ROWS * 0.8)}
              labels={{ l10: copy.gauge10, l100: copy.gauge100, l1000: copy.gauge1000, unit: copy.gaugeUnit }}
            />
            <Graticule w={glassSize.w} h={glassSize.h} />
            <IdleTrace w={glassSize.w} seed={dayKey(date) + 1} />
            <GridLabels w={glassSize.w} fw={copy.firmware} trig={copy.trig} tb={copy.timebase} />

            <View style={[s.readout, { left: gridLeft, top: gridBottom + 28 }]} testID="readout">
              {shown.map((l, i) => (
                <Text key={lines[i]} style={i === lines.length - 1 ? s.stM : s.stS}>
                  {l}
                  {typing && l.length > 0 && l.length < lines[i].length ? '_' : ''}
                </Text>
              ))}
              <Text style={s.activity}>{`${copy.actIdx} ${index}/5 · ${copy.moon} ${moonPct}%`}</Text>
              <Text style={s.peak}>{`${copy.nextPeak}  +${peakDays} D`}</Text>
            </View>

            {acknowledged ? null : (
              <View style={s.stickerSlot} testID="sticker">
                <Sticker {...identity} />
              </View>
            )}
          </View>
          <Screw corner={0} />
          <Screw corner={1} />
          <Screw corner={2} />
          <Screw corner={3} burred />
        </View>
        <View style={s.ledWrap}>
          <LedLadder />
        </View>
      </View>

      <View style={s.keyBand}>
        {acknowledged ? (
          <View style={s.miniSlot}>
            <MiniSticker {...identity} />
          </View>
        ) : null}
        <KeyRow slots={[null, null, null, { testID: 'key-acknowledge', label: copy.keyLabel, legend: copy.key, onPress: onAcknowledge }]} />
      </View>
    </View>
  );
}

const GUTTER = 14;

const s = StyleSheet.create({
  housing: {
    flex: 1,
    backgroundColor: color.n3,
    borderTopWidth: 1,
    borderTopColor: color.n4,
    borderBottomWidth: 2,
    borderBottomColor: color.n1,
    paddingHorizontal: GUTTER,
    overflow: 'hidden',
  },

  nameplate: {
    marginHorizontal: space.gutter - GUTTER,
    height: 28,
    backgroundColor: color.n5,
    borderRadius: radius.plate,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  plateText: {
    ...type.lbS,
    fontFamily: font.labelBold,
    color: color.n2,
    textShadowColor: color.n6,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  rivet: { position: 'absolute', top: 12, width: 4, height: 4, borderRadius: 2, backgroundColor: color.n4 },
  scuff: { position: 'absolute', left: '50%', top: 8, width: 6, height: 2, backgroundColor: color.n4, opacity: 0.5 },

  windowRow: { flex: 1, flexDirection: 'row', marginTop: 18, marginBottom: 18 },
  windowWrap: { flex: 1 },
  glass: {
    flex: 1,
    backgroundColor: color.n0,
    borderRadius: radius.window,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopColor: color.n1,
    borderLeftColor: color.n1,
    overflow: 'hidden',
  },
  ledWrap: { width: 28, marginLeft: 14, alignSelf: 'flex-start' },

  readout: { position: 'absolute' },
  stS: { ...type.rdS, color: color.p4, height: 22 },
  stM: { ...type.rdM, color: color.p4, height: 28, marginTop: space.unit },
  activity: { ...type.rdM, color: color.p3, marginTop: space.unit * 2 },
  peak: { ...type.rdS, color: color.p3 },

  stickerSlot: { position: 'absolute', left: STICKER_INSET + 2, right: STICKER_INSET + 2, bottom: STICKER_INSET + 5 },

  keyBand: { height: 88, justifyContent: 'flex-end' },
  miniSlot: { position: 'absolute', left: 2, top: 0 },
});
