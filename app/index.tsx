import { useState, useSyncExternalStore } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activityIndex } from '../src/ui/boot/activity';
import { type BootParams, readBootParams } from '../src/ui/boot/params';
import { Graticule, LedLadder, MiniSticker, Screw, Sticker, useTyped } from '../src/ui/boot/parts';
import { color, font, radius, size, space, type } from '../src/ui/tokens';

const copy = {
  maker: 'VELDEN  FS-4/87-P',
  serial: 'FS4-8711-00417-6',
  ghost: 'VELDEN',
  firmware: 'FW 3.1.7 · ROM C2-8811',
  key: 'ACKNOWLEDGE',
};

const SELFTEST = ['FLUX OK', 'THERM OK', 'ACOUST OK', 'SELFTEST OK'];
const TOTAL = SELFTEST.reduce((n, l) => n + l.length, 0);
const TYPE_CPS = 40;

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

function Boot({ params: { isStatic, date } }: { params: BootParams }) {
  const insets = useSafeAreaInsets();
  const { index, moonPct } = activityIndex(date);
  const typed = useTyped(TOTAL, TYPE_CPS, isStatic);
  const [acknowledged, setAcknowledged] = useState(false);
  const [glassSize, setGlassSize] = useState({ w: 0, h: 0 });
  const onGlass = (e: LayoutChangeEvent) =>
    setGlassSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const lines = SELFTEST.map((l, i) => {
    const before = SELFTEST.slice(0, i).reduce((n, p) => n + p.length, 0);
    return l.slice(0, Math.max(0, Math.min(l.length, typed - before)));
  });
  const typing = typed < TOTAL;

  return (
    <View testID="boot-screen" style={[s.housing, { paddingTop: insets.top + 12 }]}>
      <View style={s.wearL} />
      <View style={s.wearR} />

      <View style={s.nameplate}>
        <View style={[s.rivet, { left: 8 }]} />
        <Text style={s.plateText}>{copy.maker}</Text>
        <Text style={s.plateText}>{copy.serial}</Text>
        <View style={[s.rivet, { right: 8 }]} />
        <View style={s.scuff} />
      </View>

      <View style={s.windowRow}>
        <View style={s.windowWrap}>
          <View style={s.glass}>
            <View style={StyleSheet.absoluteFill} onLayout={onGlass} pointerEvents="none">
              <Graticule w={glassSize.w} h={glassSize.h} />
            </View>

            <Text style={s.ghost} numberOfLines={1}>
              {copy.ghost}
            </Text>

            <View style={[!acknowledged && s.readoutDim]} testID="readout">
              <Text style={s.firmware}>{copy.firmware}</Text>
              <View style={s.selftest}>
                {lines.map((l, i) => (
                  <Text key={SELFTEST[i]} style={i === SELFTEST.length - 1 ? s.stM : s.stS}>
                    {l}
                    {typing && l.length > 0 && l.length < SELFTEST[i].length ? '_' : ''}
                  </Text>
                ))}
              </View>
              <Text style={s.activity}>{`IDX ${index}/5 · MOON ${moonPct}%`}</Text>
            </View>

            {acknowledged ? null : (
              <View style={s.stickerSlot}>
                <Sticker />
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
            <MiniSticker />
          </View>
        ) : null}
        <Pressable
          testID="key-acknowledge"
          accessibilityRole="button"
          accessibilityLabel="Acknowledge"
          onPress={() => setAcknowledged(true)}
          style={({ pressed }) => [s.key, pressed && s.keyDown]}
        >
          <Text style={s.keyLegend} numberOfLines={1}>
            {copy.key}
          </Text>
        </Pressable>
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
  wearL: { position: 'absolute', left: 0, top: '44%', width: 3, height: 58, backgroundColor: color.n4, opacity: 0.35 },
  wearR: { position: 'absolute', right: 0, top: '30%', width: 3, height: 46, backgroundColor: color.n4, opacity: 0.3 },

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
  scuff: { position: 'absolute', right: 58, top: 8, width: 6, height: 2, backgroundColor: color.n4, opacity: 0.5 },

  windowRow: { flex: 1, flexDirection: 'row', marginTop: GUTTER, marginBottom: GUTTER },
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
    padding: space.gutter,
  },
  ledWrap: { width: 28, marginLeft: 8, alignSelf: 'flex-start' },

  ghost: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '47%',
    textAlign: 'center',
    fontFamily: font.readout,
    fontSize: 96,
    lineHeight: 88,
    color: color.p0,
  },
  readoutDim: { opacity: 0.6 },
  firmware: { ...type.rdS, color: color.p3 },
  selftest: { marginTop: space.unit * 2, height: 22 * 3 + 28 },
  stS: { ...type.rdS, color: color.p4, height: 22 },
  stM: { ...type.rdM, color: color.p4, height: 28, marginTop: space.unit },
  activity: { ...type.rdM, color: color.p3, marginTop: space.unit * 3 },

  stickerSlot: { position: 'absolute', left: 0, right: 0, bottom: 40 },

  keyBand: { height: 88, alignItems: 'center', justifyContent: 'center' },
  miniSlot: { position: 'absolute', left: 2, bottom: 20 },
  key: {
    width: 72,
    height: size.keyH,
    borderRadius: radius.key,
    backgroundColor: color.n3,
    borderWidth: 1,
    borderColor: color.n4,
    borderBottomWidth: 3,
    borderBottomColor: color.n1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyDown: { backgroundColor: color.n2, borderBottomWidth: 1, borderTopWidth: 3, borderTopColor: color.n1 },
  keyLegend: { fontFamily: font.labelBold, fontSize: 9, lineHeight: 12, letterSpacing: 0, color: color.n6 },
});
