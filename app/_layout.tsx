import { B612Mono_400Regular, B612Mono_700Bold } from '@expo-google-fonts/b612-mono';
import { VT323_400Regular } from '@expo-google-fonts/vt323';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { ensureConsent } from '../src/ads';
import { track } from '../src/analytics';
import { useSkiaReady } from '../src/fx/useSkiaReady';
import { AppState } from 'react-native';
import { startCadence } from '../src/ui/interstitial';
import { readHarness } from '../src/ui/harness';
import { color } from '../src/ui/tokens';

// Latch the sticky harness params (static, fixture, speed) from the first URL.
readHarness();

// TODO typed routes: enable `experiments.typedRoutes` once CI typechecks after the web export
// (the generated types are gitignored, so a typecheck before export has nothing to read).
export default function RootLayout() {
  // UMP runs first on every launch, before anything that requests an ad or counts an event. The
  // facade holds the gate; consent_status is dropped there unless analytics is allowed.
  useEffect(() => {
    void ensureConsent().then((c) => {
      if (c.status === 'notRequired' || c.status === 'obtained') track('consent_status', { status: c.status });
    });
  }, []);
  // The cadence machine hears appLaunch and the first session once per process.
  useEffect(() => {
    startCadence(AppState);
  }, []);
  const [loaded] = useFonts({ VT323_400Regular, B612Mono_400Regular, B612Mono_700Bold });
  // Web waits for CanvasKit (Skia's wasm backend) before the first screen; native is ready at once.
  const skia = useSkiaReady();
  if (!loaded || !skia) return null;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.n3 } }} />;
}
