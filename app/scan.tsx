import { useRouter } from 'expo-router';
import { Placeholder } from '../src/ui/screens/Placeholder';

const copy = {
  code: 'MODE 2 · SCAN',
  readout: 'Sweeping band 2.',
  next: 'RESULT',
  nextLabel: 'Show result',
};

export default function Scan() {
  const router = useRouter();
  return (
    <Placeholder
      testID="screen-scan"
      code={copy.code}
      readout={copy.readout}
      keys={[{ testID: 'key-forward', label: copy.nextLabel, legend: copy.next, onPress: () => router.push('/result/demo') }]}
    />
  );
}
