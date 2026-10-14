import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { copyOf, useLocale } from '../../i18n';
import { FIXED_SEED, dueFor, getInstallIdentity } from '../boot/install';
import { readHarness } from '../harness';
import { color, type } from '../tokens';

const copy = copyOf({ model: 'sticker.model', firmware: 'hud.firmware' });

// The unit's own plate data (model, serial, firmware, calibration), the same numbers as the nameplate and
// the housing sticker. Settings and Legal print it below their list, under the ABOUT line.
export function UnitBlock({ testID = 'settings-unit' }: { testID?: string }) {
  useLocale();
  const [unit] = useState(() => (readHarness().isStatic ? getInstallIdentity(new Date(2026, 9, 13, 12), FIXED_SEED) : getInstallIdentity()));
  return (
    <View style={s.unit} testID={testID}>
      <View style={s.unitRow}>
        <Text style={s.unitText}>{copy.model}</Text>
        <Text style={s.unitValue}>{unit.serial}</Text>
      </View>
      <Text style={s.unitText}>{copy.firmware}</Text>
      <Text style={s.unitText}>{`CAL ${unit.cal}  DUE ${dueFor(unit.cal)}  PRÜF ${unit.pruef}`}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  unit: { marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: color.p1 },
  unitRow: { flexDirection: 'row', justifyContent: 'space-between' },
  unitText: { ...type.rdXS, color: color.p3 },
  unitValue: { ...type.rdXS, color: color.p4 },
});
