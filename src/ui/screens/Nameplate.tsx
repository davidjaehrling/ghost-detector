import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { plateSerial } from '../serial';
import { color, font, radius, space, type } from '../tokens';

export const MAKER = 'VELDEN  FS-4/87-P';

const GUTTER = 14;

// The riveted aluminium strip: maker left, serial right (one rule for every screen, src/ui/serial.ts).
// Kept apart from Housing so the FAULT screen can draw it without pulling in the glass stack.
export function Nameplate({ serial }: { serial: string }) {
  const { width: windowW } = useWindowDimensions();
  return (
    <View style={s.nameplate}>
      <View style={[s.rivet, { left: 8 }]} />
      <Text style={s.plateText}>{MAKER}</Text>
      <View style={s.scuff} />
      <Text style={s.plateText}>{plateSerial(serial, windowW)}</Text>
      <View style={[s.rivet, { right: 8 }]} />
    </View>
  );
}

const s = StyleSheet.create({
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
});
