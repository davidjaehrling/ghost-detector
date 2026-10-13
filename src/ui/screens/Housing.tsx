import { type ReactNode, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FIXED_SEED, type InstallIdentity, getInstallIdentity } from '../boot/install';
import { Key, type KeySlot, KeyRow, LedLadder, Screw, Wear } from '../boot/parts';
import { color, font, radius, space, type } from '../tokens';

export const MAKER = 'VELDEN  FS-4/87-P';
// Under this window width the nameplate carries the last 7 characters of the serial.
export const SERIAL_SHORT_BELOW = 380;

export const plateSerial = (serial: string, windowW: number) => (windowW < SERIAL_SHORT_BELOW ? serial.slice(-7) : serial);

export type GlassSize = { w: number; h: number };

// Bible section 2 housing for the live screens: nameplate with serial, screen
// window with four screws, LED ladder plate on the right, key band below.
// `children` draws on the glass and receives its measured size.
export function Housing({
  testID,
  leds,
  fixedIdentity,
  glassLabel,
  keys,
  identity: given,
  children,
}: {
  testID: string;
  leds: number;
  /** Harness: use the fixed identity so goldens do not depend on the install seed. */
  fixedIdentity: boolean;
  /** Reading for screen readers; when omitted the glass children stay individually reachable. */
  glassLabel?: string;
  /** Boot passes the identity of its (harness) date. */
  identity?: InstallIdentity;
  /** Four slots, left to right; null is an engraved dummy cap. Slot 3 is the primary action. */
  keys: readonly (KeySlot | null)[];
  children: (size: GlassSize) => ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width: windowW } = useWindowDimensions();
  const [size, setSize] = useState<GlassSize>({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const own = useMemo(
    () => (fixedIdentity ? getInstallIdentity(new Date(2026, 9, 13, 12), FIXED_SEED) : getInstallIdentity()),
    [fixedIdentity],
  );
  const identity = given ?? own;
  return (
    <View testID={testID} style={[s.housing, { paddingTop: insets.top + 12 }]}>
      <Wear side="left" top="44%" length={58} />
      <Wear side="right" top="62%" length={46} />
      <View style={s.nameplate}>
        <View style={[s.rivet, { left: 8 }]} />
        <Text style={s.plateText}>{MAKER}</Text>
        <View style={s.scuff} />
        <Text style={s.plateText}>{plateSerial(identity.serial, windowW)}</Text>
        <View style={[s.rivet, { right: 8 }]} />
      </View>
      <View style={s.windowRow}>
        <View style={s.windowWrap}>
          <View style={s.glass} accessibilityLabel={glassLabel} accessible={glassLabel !== undefined}>
            <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none" />
            {size.w > 0 ? children(size) : null}
          </View>
          <Screw corner={0} />
          <Screw corner={1} />
          <Screw corner={2} />
          <Screw corner={3} burred />
        </View>
        <View style={s.ledWrap}>
          <LedLadder lit={leds} />
        </View>
      </View>
      <View style={s.keyBand}>
        <KeyRow slots={keys} />
      </View>
    </View>
  );
}

export { Key };

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
  // The scuff sits in the left half of the plate, under the maker text's baseline, never on a letter.
  scuff: { position: 'absolute', left: 64, top: 22, width: 6, height: 2, backgroundColor: color.n4, opacity: 0.5 },
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
  keyBand: { height: 88, justifyContent: 'flex-end' },
});
