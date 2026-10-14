import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fitRelay, relayCopy, relayStore } from '../../state/relay';
import { notifyBackend } from '../../state/notifyBackend';
import { color, radius, type } from '../tokens';

// The FIELD LOG RELAY opt-in (brief section 2.2): a module on the viewfinder glass, in the unit's
// voice, before any system dialog. FIT RELAY and NOT NOW are the same key in size, weight and
// contrast. The system permission is requested only from the FIT RELAY tap.
const RESULT_MS = 2400;

export function RelayModule({ bottom, still, onDone }: { bottom: number; still: boolean; onDone: () => void }) {
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    if (line === null || still) return;
    const id = setTimeout(onDone, RESULT_MS);
    return () => clearTimeout(id);
  }, [line, still, onDone]);

  const fit = () => {
    void fitRelay(relayStore, notifyBackend)
      .then((fitted) => (fitted ? relayCopy.fitted : relayCopy.notFitted))
      .catch(() => relayCopy.notFitted)
      .then(setLine);
  };

  return (
    <View style={[s.module, { bottom }]} testID="relay-module" accessibilityViewIsModal={false}>
      <Text style={s.header} accessibilityRole="header">
        {relayCopy.header}
      </Text>
      {line === null ? (
        <>
          <Text style={s.body} testID="relay-body">
            {relayCopy.body}
          </Text>
          <View style={s.keys}>
            <RelayKey testID="relay-fit" legend={relayCopy.fit} onPress={fit} />
            <RelayKey testID="relay-notnow" legend={relayCopy.notNow} onPress={onDone} />
          </View>
        </>
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

function RelayKey({ testID, legend, onPress }: { testID: string; legend: string; onPress: () => void }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={legend}
      onPress={onPress}
      style={({ pressed }) => [s.key, pressed && s.keyDown]}
    >
      <Text style={s.keyLegend}>{legend}</Text>
    </Pressable>
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
  keys: { flexDirection: 'row', gap: 12, marginTop: 2 },
  key: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.n2,
    borderWidth: 1,
    borderColor: color.p3,
    borderRadius: radius.key,
  },
  keyDown: { backgroundColor: color.n1 },
  keyLegend: { ...type.lbM, color: color.p4 },
});
