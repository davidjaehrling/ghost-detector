import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { color, radius, size, space, type } from '../src/ui/tokens';

const copy = {
  maker: 'VELDEN FS-4/87-P',
  field: 'FIELD UNIT · BOOT',
  firmware: 'FW 3.1.7 · ROM C2-8811',
  selftest: 'SELFTEST OK',
  probe: 'ΔT -4.7 °C',
  serial: 'FS4-8711-00417-6',
  disclosureHead: 'SIMULATION UNIT · ENTERTAINMENT USE ONLY.',
  disclosureBody: 'All readings are generated in software. This unit detects nothing.',
  meta: 'CAL 2026-10-13 · DUE 2027-10\nPRÜF 07',
};

// Static lamp test: LEDs 1 to 4 ramp through p1..p4, LED 5 (red) stays unlit.
const leds = [color.p1, color.p2, color.p3, color.p4, color.n2];

export default function BootScreen() {
  return (
    <View testID="boot-screen" style={s.housing}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.glass}>
          <Text style={s.maker}>{copy.maker}</Text>
          <View style={s.row}>
            <View style={s.readouts}>
              <Text style={s.rdS}>{copy.field}</Text>
              <Text style={s.rdS}>{copy.firmware}</Text>
              <Text style={s.rdS}>{copy.selftest}</Text>
              <Text style={s.rdM}>{copy.probe}</Text>
              <Text style={s.serial}>{copy.serial}</Text>
            </View>
            <View style={s.plate}>
              {[...leds].reverse().map((fill, i) => (
                <View key={i} style={[s.led, { backgroundColor: fill }]} />
              ))}
            </View>
          </View>
          <View style={s.sticker}>
            <Text style={s.stickerHead}>{copy.disclosureHead}</Text>
            <Text style={s.stickerBody}>{copy.disclosureBody}</Text>
            <Text style={s.stickerMeta}>{copy.meta}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  housing: { flex: 1, backgroundColor: color.n3, borderTopWidth: 1, borderTopColor: color.n4 },
  scroll: { flexGrow: 1, padding: space.unit * 3.5 },
  glass: {
    flexGrow: 1,
    backgroundColor: color.n0,
    borderRadius: radius.window,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopColor: color.n1,
    borderLeftColor: color.n1,
    padding: space.gutter,
  },
  maker: { ...type.lbS, color: color.p3 },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginTop: space.gutter },
  readouts: { flex: 1, paddingRight: space.gutter },
  rdS: { ...type.rdS, color: color.p4 },
  rdM: { ...type.rdM, color: color.p4, marginTop: space.unit * 2 },
  serial: { ...type.lbS, color: color.p3, marginTop: space.unit * 4 },
  plate: {
    width: 28,
    paddingVertical: space.unit * 2,
    alignItems: 'center',
    backgroundColor: color.n3,
    borderRadius: radius.plate,
    borderWidth: 1,
    borderColor: color.n4,
    gap: size.ledPitch - size.led,
  },
  led: { width: size.led, height: size.led, borderRadius: size.led / 2 },
  sticker: {
    backgroundColor: color.paper,
    padding: space.unit * 3,
    marginTop: space.unit * 8,
    alignSelf: 'flex-start',
    transform: [{ rotate: '-1.5deg' }],
  },
  stickerHead: { ...type.lbM, color: color.ink },
  stickerBody: { ...type.lbS, color: color.ink, marginTop: space.unit },
  stickerMeta: { ...type.lbXS, color: color.ink, marginTop: space.unit * 2 },
});
