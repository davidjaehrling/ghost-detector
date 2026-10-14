import { useLocalSearchParams } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { ShareProbe } from '../src/fx/share/ShareProbe';
import { color } from '../src/ui/tokens';

const subscribeNever = () => () => {};

// Hidden L2 harness route for the share card (/share-probe?format=story&case=critical-deep). Nothing links here.
export default function ShareProbeRoute() {
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const p = useLocalSearchParams<{ format?: string; case?: string; fixture?: string }>();
  if (!mounted) return <View style={{ flex: 1, backgroundColor: color.n1 }} />;
  return <ShareProbe format={p.format} kase={p.case} fixture={p.fixture} />;
}
