import { type ReactNode, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FIXED_SEED, getInstallIdentity } from '../boot/install';
import { Key, KeyRow, LedLadder, Screw, Wear } from '../boot/parts';
import { color, font, radius, space, type } from '../tokens';

export const MAKER = 'VELDEN  FS-4/87-P';

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
  dummies,
  children,
}: {
  testID: string;
  leds: number;
  /** Harness: use the fixed identity so goldens do not depend on the install seed. */
  fixedIdentity: boolean;
  glassLabel: string;
  keys: ReactNode;
  dummies: number;
  children: (size: GlassSize) => ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState<GlassSize>({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const identity = useMemo(
    () => (fixedIdentity ? getInstallIdentity(new Date(2026, 9, 13, 12), FIXED_SEED) : getInstallIdentity()),
    [fixedIdentity],
  );
  return (
    <View testID={testID} style={[s.housing, { paddingTop: insets.top + 12 }]}>
      <Wear side="left" top="44%" length={58} />
      <Wear side="right" top="62%" length={46} />
      <View style={s.nameplate}>
        <View style={[s.rivet, { left: 8 }]} />
        <Text style={s.plateText}>{MAKER}</Text>
        <Text style={s.plateText}>{identity.serial}</Text>
        <View style={[s.rivet, { right: 8 }]} />
        <View style={s.scuff} />
      </View>
      <View style={s.windowRow}>
        <View style={s.windowWrap}>
          <View style={s.glass} accessibilityLabel={glassLabel} accessible>
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
        <KeyRow dummies={dummies}>{keys}</KeyRow>
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
  keyBand: { height: 88, justifyContent: 'flex-end' },
});
