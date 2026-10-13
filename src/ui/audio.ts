import { AppState, Platform } from 'react-native';
import { resolveConfig } from '../audio/config';
import * as engineModule from '../audio/engine';
import * as hapticsModule from '../audio/haptics';
import type { AudioEngine } from '../audio/types';
import { getIntensity } from '../state/scans';
import { getSettings, subscribeSettings } from '../state/settings';
import { createSound, type Sound } from './sound';

// The app's one instance of the sound facade (src/ui/sound.ts). The engine and the haptics are
// created once, on first use, from the config defaults; intensity comes from the store and the
// switches from Settings. Native-only effects live behind src/audio; on web both are no-ops that
// record their calls.
export type { Sound };

// ---------- the app's instance ----------

let real: { engine: AudioEngine; haptics: hapticsModule.Haptics } | null = null;

function parts() {
  if (!real) {
    const cfg = resolveConfig();
    const haptics = hapticsModule.createHaptics(cfg);
    const engine = engineModule.createAudioEngine(cfg, { onNeedleTick: () => haptics.fire('needleTick') });
    real = { engine, haptics };
  }
  return real;
}

// Web harness: the cue order of this module, and the no-op engine's own logs.
type Win = { __cueLog?: string[]; __audioLog?: unknown; __hapticLog?: unknown };
const win = (): Win | null => (Platform.OS === 'web' && typeof window !== 'undefined' ? (window as unknown as Win) : null);

export const sound: Sound = createSound({
  engine: () => parts().engine,
  haptics: () => parts().haptics,
  settings: getSettings,
  intensity: getIntensity,
  onCue: (c) => {
    const w = win();
    if (w) (w.__cueLog ??= []).push(c);
  },
});

// The harness reads the no-op engine's and haptics' own logs (web only).
const w0 = win();
if (w0) {
  w0.__audioLog = engineModule.__audioLog;
  w0.__hapticLog = (hapticsModule as { __hapticLog?: unknown }).__hapticLog;
}

// Switching SOUND off mid-run silences it at once; leaving the app silences it (Android keeps the
// context alive in the background otherwise).
let wired = false;
export function wireSoundLifecycle(): void {
  if (wired) return;
  wired = true;
  subscribeSettings(() => {
    if (!getSettings().sound) sound.stop();
    if (real) real.haptics.setEnabled(getSettings().haptics);
  });
  AppState.addEventListener('change', (s) => {
    if (s === 'background' || s === 'inactive') sound.stop();
  });
}
wireSoundLifecycle();
