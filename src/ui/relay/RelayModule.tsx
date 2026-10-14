import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fitRelay, relayCopy, relayStore } from '../../state/relay';
import { notifyBackend } from '../../state/notifyBackend';
import type { KeySlot } from '../boot/parts';
import { readHarness } from '../harness';
import { stripScrimAlpha } from '../result/stripScrim';
import { color, type } from '../tokens';
import { useReduceMotion } from '../useReduceMotion';

// The FIELD LOG RELAY opt-in (brief section 2.2, D-045 6): screen text on the viewfinder glass, in the
// unit's voice, before any system dialog. No keyline and no motion: a full-width n0 band prints its title and
// sentences one line at a time, like the other instrument output. Header and body stay on the glass; FIT RELAY and NOT NOW sit on
// the hardware key row (slots 1 and 2), the same key in size, weight and contrast. CAPTURE keeps its slot and stays live. The system
// permission is requested only from the FIT RELAY press.
const RESULT_MS = 2400;
/** One printed line every LINE_MS, the pace of the scan telemetry. */
const LINE_MS = 160;

/** The module's state and its two keys. `keys` is null once the result line replaces the question. */
export function useRelayModule(still: boolean, onDone: () => void): { line: string | null; keys: readonly (KeySlot | null)[] | null } {
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    if (line === null || still) return;
    const id = setTimeout(onDone, RESULT_MS);
    return () => clearTimeout(id);
  }, [line, still, onDone]);

  const fit = useCallback(() => {
    void fitRelay(relayStore, notifyBackend)
      .then((fitted) => (fitted ? relayCopy.fitted : relayCopy.notFitted))
      .catch(() => relayCopy.notFitted)
      .then(setLine);
  }, []);

  const keys: readonly (KeySlot | null)[] | null =
    line === null
      ? [
          { testID: 'relay-fit', label: relayCopy.fit, legend: relayCopy.fit, onPress: fit, primary: true },
          { testID: 'relay-notnow', label: relayCopy.notNow, legend: relayCopy.notNow, onPress: onDone, primary: true },
          null,
          null, // slot 4 stays CAPTURE (the viewfinder fills it); pressing it counts as NOT NOW
        ]
      : null;
  return { line, keys };
}

/** The body one sentence per printed line. */
export const bodyLines = (body: string): string[] => body.split(/(?<=[.?!])\s+/).filter(Boolean);

/** How many of `total` lines are printed: all at once when still or reduced, else one per LINE_MS. */
function usePrinted(total: number): number {
  const reduce = useReduceMotion();
  const still = readHarness().isStatic || reduce;
  const [n, setN] = useState(0);
  useEffect(() => {
    if (still || n >= total) return;
    const id = setTimeout(() => setN((v) => v + 1), LINE_MS);
    return () => clearTimeout(id);
  }, [still, n, total]);
  return still ? total : n;
}

const SCRIM = stripScrimAlpha(color.p3);

export function RelayModule({ bottom, line, onDone }: { bottom: number; line: string | null; onDone: () => void }) {
  const sentences = bodyLines(relayCopy.body);
  // Line 0 is the title, then one line per sentence. The last sentence says the lines are simulated: p4.
  const printed = usePrinted(1 + sentences.length);
  return (
    <View style={[s.module, { bottom }]} testID="relay-module" accessibilityViewIsModal={false}>
      <Text style={[s.header, { opacity: printed >= 1 ? 1 : 0 }]} accessibilityRole="header">
        {relayCopy.header}
      </Text>
      {line === null ? (
        <Text style={s.body} testID="relay-body">
          {sentences.map((sentence, i) => (
            <Text key={i} style={[i === sentences.length - 1 ? s.simulated : s.sentence, { opacity: printed >= i + 2 ? 1 : 0 }]}>
              {i > 0 ? '\n' : ''}
              {sentence}
            </Text>
          ))}
        </Text>
      ) : (
        <Pressable onPress={onDone} testID="relay-result-box" accessibilityRole="button" accessibilityLabel={line}>
          <Text style={s.result} testID="relay-result">
            {line}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  module: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: `rgba(10, 15, 11, ${SCRIM})`,
    borderTopWidth: 1,
    borderTopColor: color.p1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  header: { ...type.rdS, color: color.p4 },
  body: { ...type.rdXS },
  sentence: { color: color.p3 },
  simulated: { color: color.p4 },
  result: { ...type.rdS, color: color.p5 },
});
