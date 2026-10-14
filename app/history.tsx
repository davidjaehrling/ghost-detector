import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { sound } from '../src/ui/audio';
import { Placeholder } from '../src/ui/screens/Placeholder';

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
  return (
    <Placeholder
      testID="screen-history"
      code={copy.code}
      readout={copy.readout}
      keys={[{ testID: 'key-forward', label: copy.nextLabel, legend: copy.next, onPress: () => router.push('/settings') }]}
    />
  );
}
