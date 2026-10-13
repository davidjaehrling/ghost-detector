import { B612Mono_400Regular, B612Mono_700Bold } from '@expo-google-fonts/b612-mono';
import { VT323_400Regular } from '@expo-google-fonts/vt323';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { readHarness } from '../src/ui/harness';
import { color } from '../src/ui/tokens';

// Latch the sticky harness params (static, fixture, speed) from the first URL.
readHarness();

export default function RootLayout() {
  const [loaded] = useFonts({ VT323_400Regular, B612Mono_400Regular, B612Mono_700Bold });
  if (!loaded) return null;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.n3 } }} />;
}
