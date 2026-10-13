import { useRouter } from 'expo-router';
import { Placeholder } from '../src/ui/screens/Placeholder';

const copy = {
  code: 'MODE 5 · SETTINGS',
  readout: 'Jump-scares: ON',
  next: 'BACK',
  nextLabel: 'Back to history',
};

export default function Settings() {
  const router = useRouter();
  return (
    <Placeholder
      testID="screen-settings"
      code={copy.code}
      readout={copy.readout}
      keys={[{ testID: 'key-forward', label: copy.nextLabel, legend: copy.next, onPress: () => router.back() }]}
    />
  );
}
