import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { AdBanner } from '../src/ads/Banner';
import { sound } from '../src/ui/audio';
import { Placeholder } from '../src/ui/screens/Placeholder';
import { color } from '../src/ui/tokens';

const copy = {
  code: 'MODE 4 · HISTORY',
  readout: 'No cases logged.',
  next: 'SETTINGS',
  nextLabel: 'Open settings',
};

export default function History() {
  const router = useRouter();
  // Nothing plays here; a scene left running from the result ends.
  useEffect(() => sound.stop(), []);
  // The one banner in the app sits in a fixed slot under the key band, 24 dp clear of every control.
  return (
    <View style={s.root}>
      <Placeholder
        testID="screen-history"
        code={copy.code}
        readout={copy.readout}
        keys={[{ testID: 'key-forward', label: copy.nextLabel, legend: copy.next, onPress: () => router.push('/settings') }]}
      />
      <AdBanner />
    </View>
  );
}

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: color.n3 } });
