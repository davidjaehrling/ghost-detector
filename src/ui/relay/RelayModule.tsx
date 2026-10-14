import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fitRelay, relayCopy, relayStore } from '../../state/relay';
import { notifyBackend } from '../../state/notifyBackend';
import type { KeySlot } from '../boot/parts';
import { color, radius, type } from '../tokens';

// The FIELD LOG RELAY opt-in (brief section 2.2): a module on the viewfinder glass, in the unit's
// voice, before any system dialog. Header and body stay on the glass; FIT RELAY and NOT NOW sit on
// the hardware key row (slots 1 and 2), the same key in size, weight and contrast. CAPTURE keeps its slot and stays live. The system
// permission is requested only from the FIT RELAY press.
const RESULT_MS = 2400;

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

export function RelayModule({ bottom, line, onDone }: { bottom: number; line: string | null; onDone: () => void }) {
  return (
    <View style={[s.module, { bottom }]} testID="relay-module" accessibilityViewIsModal={false}>
      <Text style={s.header} accessibilityRole="header">
        {relayCopy.header}
      </Text>
      {line === null ? (
        <Text style={s.body} testID="relay-body">
          {relayCopy.body}
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
    left: 12,
    right: 12,
    backgroundColor: color.n0,
    borderWidth: 1,
    borderColor: color.p3,
    borderRadius: radius.plate,
    padding: 12,
    gap: 8,
  },
  header: { ...type.lbM, color: color.p5 },
  body: { ...type.rdXS, color: color.p4 },
  result: { ...type.rdS, color: color.p5 },
});
