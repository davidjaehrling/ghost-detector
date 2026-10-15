import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { composeFields } from './readoutFields';
import { color, type } from './tokens';

// One readout row for every screen (D-007): the label field, the number
// right-aligned in a fixed-width field, the unit left-aligned in its own
// field, an optional status. VT323 is monospace, so padded strings give true
// columns and a partly typed row keeps every column where it will end up.

type Size = 'rdXS' | 'rdS' | 'rdM' | 'rdL';

export type ReadoutProps = {
  label: string;
  value: string;
  unit?: string;
  status?: string;
  size?: Size;
  labelCh?: number;
  valueCh?: number;
  unitCh?: number;
  labelColor?: string;
  valueColor?: string;
  unitColor?: string;
  statusColor?: string;
  /** Show only the first n characters of the composed row (typed boot lines). */
  typed?: number;
  testID?: string;
};

// Memoised: props are strings and numbers, so a row re-renders only when its text or tone changes.
// A fixed-pitch field grid: its cells are sized in characters of the unscaled face, so the OS font scale
// does not apply to it (the sentences around it, the rows and the lists do scale).
export const Readout = memo(function Readout(props: ReadoutProps) {
  const { size = 'rdS', typed, testID } = props;
  const { labelColor = color.p3, valueColor = color.p4, unitColor = color.p3, statusColor = color.p4 } = props;
  const fields = composeFields(props);
  const tones = [labelColor, labelColor, valueColor, unitColor, unitColor, unitColor, statusColor];
  const limit = typed === undefined ? Infinity : typed;
  const parts = fields.map((f, i) => {
    const before = fields.slice(0, i).reduce((n, g) => n + g.length, 0);
    return f.slice(0, Math.max(0, limit - before));
  });
  return (
    <View testID={testID} style={s.row}>
      <Text style={[type[size], { height: ROW_H[size] }]} numberOfLines={1} maxFontSizeMultiplier={1}>
        {parts.map((p, i) => (
          <Text key={i} style={{ color: tones[i] }}>
            {p}
          </Text>
        ))}
      </Text>
    </View>
  );
});

// Row heights on the 4 px grid.
const ROW_H: Record<Size, number> = { rdXS: 20, rdS: 24, rdM: 28, rdL: 44 };

const s = StyleSheet.create({
  row: { flexDirection: 'row' },
});
