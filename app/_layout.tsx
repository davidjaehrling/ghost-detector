import { B612Mono_400Regular, B612Mono_700Bold } from '@expo-google-fonts/b612-mono';
import { VT323_400Regular } from '@expo-google-fonts/vt323';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';

export default function RootLayout() {
  const [loaded] = useFonts({ VT323_400Regular, B612Mono_400Regular, B612Mono_700Bold });
  if (!loaded) return null;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#2E3229' } }} />;
}
