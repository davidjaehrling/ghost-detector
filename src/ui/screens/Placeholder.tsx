import { type ReactNode, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FIXED_SEED, getInstallIdentity } from '../boot/install';
import { Graticule, type KeySlot, KeyRow, LedLadder, MiniSticker, Screw, Wear } from '../boot/parts';
import { readHarness } from '../harness';
import { SLOT_GAP_BELOW } from '../keyLayout';
import { Nameplate } from './Nameplate';
import { color, radius, type } from '../tokens';

export type KeySpec = KeySlot;


// In-character placeholder: housing frame, nameplate with the screen code, one
// readout line on the glass, and keys (the forward key last, right of centre).
export function Placeholder({
  testID,
  code,
  readout,
  sub,
  keys,
  graticule = true,
  slot,
  children,
}: {
  testID: string;
  code: string;
  readout?: string;
  sub?: string;
  /** Up to four slots, left to right; fewer than four sit right-aligned. `null` leaves a slot blank. */
  keys: (KeySpec | null)[];
  /** List screens draw none: the grid's outer columns would show at the glass edges beside the list. */
  graticule?: boolean;
  /** A fixed-height strip between the window and the key row (the history banner). The window gives up the height. */
  slot?: ReactNode;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const identity = useMemo(() => (readHarness().isStatic ? getInstallIdentity(new Date(2026, 9, 13, 12), FIXED_SEED) : getInstallIdentity()), []);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  return (
    <View testID={testID} style={[s.housing, { paddingTop: insets.top + 12 }]}>
      <Wear side="left" top="44%" length={58} />
      <Wear side="right" top="62%" length={46} />
      <Nameplate serial={identity.serial} />
      <View style={s.windowRow}>
        <View style={s.windowWrap}>
        <View style={s.glass}>
          <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none" />
          {graticule ? <Graticule w={size.w} h={size.h} /> : null}
          <View style={s.readoutBlock}>
            <Text style={s.sub}>{code}</Text>
            {sub ? <Text style={s.sub}>{sub}</Text> : null}
            {readout ? (
              <Text style={s.readout} accessibilityLabel={readout}>
                {readout}
              </Text>
            ) : null}
          </View>
          {children}
        </View>
        <Screw corner={0} />
        <Screw corner={1} />
        <Screw corner={2} />
        <Screw corner={3} burred />
        </View>
        <View style={s.ledWrap}>
          <LedLadder lit={1} />
        </View>
      </View>
      {slot ? <View style={s.slot}>{slot}</View> : null}
      <View style={s.keyBand}>
        <MiniSticker cal={identity.cal} pruef={identity.pruef} style={s.sticker} />
        <KeyRow slots={[null, null, null, ...keys].slice(-4)} />
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
  // Same window row as Housing: the window beside the LED plate (power LED only), 18 px above and below.
  windowRow: { flex: 1, flexDirection: 'row', marginTop: 18, marginBottom: 18 },
  windowWrap: { flex: 1 },
  ledWrap: { width: 28, marginLeft: 14, alignSelf: 'flex-start' },
  slot: { marginHorizontal: -GUTTER, marginBottom: SLOT_GAP_BELOW },
  sticker: { position: 'absolute', left: 10, top: -15 },
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
  readoutBlock: { position: 'absolute', left: 16, right: 16, bottom: 20 },
  sub: { ...type.rdS, color: color.p3 },
  readout: { ...type.rdM, color: color.p4 },
  keyBand: { height: 88, justifyContent: 'flex-end' },
});
