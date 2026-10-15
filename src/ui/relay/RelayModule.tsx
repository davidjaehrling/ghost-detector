import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fitRelay, relayCopy, relayStore } from '../../state/relay';
import { notifyBackend } from '../../state/notifyBackend';
import type { KeySlot } from '../boot/parts';
import { RELAY_SCRIM } from './scrim';
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

/** The body one sentence per printed line. */
export const bodyLines = (body: string): string[] => body.split(/(?<=[.?!])\s+/).filter(Boolean);

/** Lines in the module: the title, then one per sentence. */
export const relayLineCount = (body: string): number => 1 + bodyLines(body).length;

/** FIT RELAY is live only once the whole offer, the simulated sentence last, is printed. */
export const fitLive = (printed: number, total: number): boolean => printed >= total;

/** The module's state and its two keys. `keys` is null once the result line replaces the question. */
export function useRelayModule(
  still: boolean,
  onDone: () => void,
  open = true,
): { line: string | null; keys: readonly (KeySlot | null)[] | null; printed: number; total: number } {
  const [line, setLine] = useState<string | null>(null);
  const reduce = useReduceMotion();
  const quick = still || reduce;
  const total = relayLineCount(relayCopy.body);
  const [n, setN] = useState(0);
  // The count restarts each time the offer closes (state adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setN(0);
  }
  // One printed line every LINE_MS while the offer is up; whole at once when still or reduced.
  useEffect(() => {
    if (!open || quick || n >= total) return;
    const id = setTimeout(() => setN((v) => v + 1), LINE_MS);
    return () => clearTimeout(id);
  }, [open, quick, n, total]);
  const printed = quick ? total : n;
  const live = fitLive(printed, total);

  useEffect(() => {
    if (line === null || still) return;
    const id = setTimeout(onDone, RESULT_MS);
    return () => clearTimeout(id);
  }, [line, still, onDone]);

  const fit = useCallback(() => {
    if (!live) return;
    void fitRelay(relayStore, notifyBackend)
      .then((fitted) => (fitted ? relayCopy.fitted : relayCopy.notFitted))
      .catch(() => relayCopy.notFitted)
      .then(setLine);
  }, [live]);

  const keys: readonly (KeySlot | null)[] | null =
    line === null
      ? [
          { testID: 'relay-fit', label: relayCopy.fit, legend: relayCopy.fit, onPress: fit, primary: true },
          { testID: 'relay-notnow', label: relayCopy.notNow, legend: relayCopy.notNow, onPress: onDone, primary: true },
          null,
          null, // slot 4 stays CAPTURE (the viewfinder fills it); pressing it counts as NOT NOW
        ]
      : null;
  return { line, keys, printed, total };
}

const SCRIM = RELAY_SCRIM;

export function RelayModule({ bottom, line, printed, onDone }: { bottom: number; line: string | null; printed: number; onDone: () => void }) {
  const sentences = bodyLines(relayCopy.body);
  // Line 0 is the title, then one line per sentence. The last sentence says the lines are simulated: p4.
  // data-printed="1" marks the module whole (web readiness for the e2e specs).
  const ready = fitLive(printed, 1 + sentences.length);
  // react-native-web turns dataSet into data-* attributes (not in RN's View types).
  const web = { dataSet: { printed: ready ? '1' : '0' } } as Record<string, unknown>;
  return (
    <View style={[s.module, { bottom }]} testID="relay-module" accessibilityViewIsModal={false} {...web}>
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
        <Pressable onPress={onDone} testID="relay-result-box" accessibilityRole="button" accessibilityLabel={line} style={s.resultBox}>
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
    paddingVertical: 5,
    gap: 4,
  },
  header: { ...type.rdS, color: color.p4 },
  body: { ...type.rdXS },
  sentence: { color: color.p3 },
  simulated: { color: color.p4 },
  // A 44 dp hit area around the one-line result without growing the band: the box overlaps its padding.
  resultBox: { minHeight: 44, marginVertical: -11, justifyContent: 'center' },
  result: { ...type.rdS, color: color.p5 },
});
