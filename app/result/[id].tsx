import { useLocalSearchParams, useRouter } from 'expo-router';
import { Placeholder } from '../../src/ui/screens/Placeholder';

const copy = {
  code: 'MODE 3 · RESULT',
  sub: 'CASE',
  readout: 'Baseline. No signature.',
  next: 'HISTORY',
  nextLabel: 'Open history',
  back: 'BACK',
  backLabel: 'Back to viewfinder',
};

export default function Result() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Placeholder
      testID="screen-result"
      code={copy.code}
      sub={`${copy.sub} ${String(id ?? '').toUpperCase()}`}
      readout={copy.readout}
      keys={[
        { testID: 'key-back', label: copy.backLabel, legend: copy.back, width: 72, onPress: () => router.navigate('/viewfinder') },
        { testID: 'key-forward', label: copy.nextLabel, legend: copy.next, onPress: () => router.push('/history') },
      ]}
    />
  );
}
