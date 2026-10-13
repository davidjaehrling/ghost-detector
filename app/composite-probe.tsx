import { useLocalSearchParams } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { CompositeProbe } from '../src/fx/compositor/CompositeProbe';
import { readHarness } from '../src/ui/harness';
import { color } from '../src/ui/tokens';

const subscribeNever = () => () => {};

// Hidden L2 harness route for compositor v1 (/composite-probe?static=1&fixture=cellar&demo=active).
// Nothing links here. Client only: harness params do not exist in the static render.
export default function CompositeProbeRoute() {
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const params = useLocalSearchParams<{ demo?: string; variant?: string }>();
  if (!mounted) return <View style={{ flex: 1, backgroundColor: color.n3 }} />;
  return <CompositeProbe fixture={readHarness().fixture} demo={params.demo} variant={params.variant} />;
}
