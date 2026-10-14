import { StyleSheet, View } from 'react-native';
import { color } from '../tokens';

// A row of equal blocks lit left to right: the scan progress bar and the rate bar
// share it. `blinkLast` hides the last lit block (the caller toggles it) so a stalled
// bar shows its leading block blinking.
export const BLOCKS = 20;
export const RATE_MIN_H = 4;
export const RATE_MAX_H = 14;

export function BlockBar({
  lit,
  left,
  top,
  bottom,
  width,
  litColor = color.p4,
  dimColor = color.p1,
  hideLast = false,
  variant = 'progress',
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
  /** 'progress': a framed row of level blocks. 'rate': a frameless ramp of rising columns. */
  variant?: 'progress' | 'rate';
  testID?: string;
  label?: string;
}) {
  if (variant === 'rate') return <RateRamp lit={lit} left={left} bottom={bottom} top={top} width={width} litColor={litColor} dimColor={dimColor} testID={testID} label={label} />;
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
  ramp: { position: 'absolute', height: RATE_MAX_H, flexDirection: 'row', alignItems: 'flex-end' },
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

// The rate bar reads as a different instrument from the progress bar: no frame, thin columns that
// rise left to right (4 to 14 px) on a common baseline, like a signal-strength meter.
export function rampHeight(i: number, n = BLOCKS): number {
  return Math.round(RATE_MIN_H + ((RATE_MAX_H - RATE_MIN_H) * i) / (n - 1));
}

function RateRamp({ lit, left, top, bottom, width, litColor, dimColor, testID, label }: { lit: number; left: number; top?: number; bottom?: number; width: number; litColor: string; dimColor: string; testID?: string; label?: string }) {
  const gap = 3;
  const cw = (width - gap * (BLOCKS - 1)) / BLOCKS;
  return (
    <View style={[s.ramp, { left, width }, top !== undefined ? { top } : null, bottom !== undefined ? { bottom } : null]} testID={testID} accessibilityLabel={label}>
      {Array.from({ length: BLOCKS }, (_, i) => (
        <View key={i} style={{ width: cw, height: rampHeight(i), marginRight: i === BLOCKS - 1 ? 0 : gap, backgroundColor: i < lit ? litColor : dimColor }} />
      ))}
    </View>
  );
}
