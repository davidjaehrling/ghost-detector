import { type ReactNode, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Graticule, type KeySlot, KeyRow, Screw } from '../boot/parts';
import { color, font, radius, space, type } from '../tokens';

export type KeySpec = KeySlot;

// In-character placeholder: housing frame, nameplate with the screen code, one
// readout line on the glass, and keys (the forward key last, right of centre).
export function Placeholder({
  testID,
  code,
  readout,
  sub,
  keys,
  children,
}: {
  testID: string;
  code: string;
  readout: string;
  sub?: string;
  keys: KeySpec[];
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  return (
    <View testID={testID} style={[s.housing, { paddingTop: insets.top + 12 }]}>
      <View style={s.nameplate}>
        <View style={[s.rivet, { left: 8 }]} />
        <Text style={s.plateText}>{code}</Text>
        <View style={[s.rivet, { right: 8 }]} />
      </View>
      <View style={s.windowWrap}>
        <View style={s.glass}>
          <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none" />
          <Graticule w={size.w} h={size.h} />
          <View style={s.readoutBlock}>
            {sub ? <Text style={s.sub}>{sub}</Text> : null}
            <Text style={s.readout} accessibilityLabel={readout}>
              {readout}
            </Text>
          </View>
          {children}
        </View>
        <Screw corner={0} />
        <Screw corner={1} />
        <Screw corner={2} />
        <Screw corner={3} burred />
      </View>
      <View style={s.keyBand}>
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
  nameplate: {
    marginHorizontal: space.gutter - GUTTER,
    height: 28,
    backgroundColor: color.n5,
    borderRadius: radius.plate,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
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
  windowWrap: { flex: 1, marginTop: 18, marginBottom: 18 },
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
