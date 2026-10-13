import { StyleSheet, View } from 'react-native';
import { color } from '../tokens';

// A row of equal blocks lit left to right: the scan progress bar and the rate bar
// share it. `blinkLast` hides the last lit block (the caller toggles it) so a stalled
// bar shows its leading block blinking.
export const BLOCKS = 20;

export function BlockBar({
  lit,
  left,
  top,
  bottom,
  width,
  litColor = color.p4,
  dimColor = color.p1,
  hideLast = false,
  testID,
  label,
}: {
  lit: number;
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  litColor?: string;
  dimColor?: string;
  hideLast?: boolean;
  testID?: string;
  label?: string;
}) {
  const gap = 2;
  const bw = (width - 4 - gap * (BLOCKS - 1)) / BLOCKS;
  return (
    <View style={[s.bar, { left, width }, top !== undefined ? { top } : null, bottom !== undefined ? { bottom } : null]} testID={testID} accessibilityLabel={label}>
      {Array.from({ length: BLOCKS }, (_, i) => {
        const on = i < lit && !(hideLast && i === lit - 1);
        return <View key={i} style={{ width: bw, height: 6, marginRight: i === BLOCKS - 1 ? 0 : gap, backgroundColor: on ? litColor : dimColor }} />;
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    position: 'absolute',
    height: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 1,
    borderWidth: 1,
    borderColor: color.p2,
  },
});
