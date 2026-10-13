import { useRouter } from 'expo-router';
import { Placeholder } from '../src/ui/screens/Placeholder';

const copy = {
  code: 'MODE 1 · VIEWFINDER',
  readout: 'FIELD --- mG · IDX -/5',
  next: 'SCAN',
  nextLabel: 'Start scan',
};

export default function Viewfinder() {
  const router = useRouter();
  return (
    <Placeholder
      testID="screen-viewfinder"
      code={copy.code}
      readout={copy.readout}
      keys={[{ testID: 'key-forward', label: copy.nextLabel, legend: copy.next, onPress: () => router.push('/scan') }]}
    />
  );
}
