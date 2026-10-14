/** Web no-op with the same API. Records events in the shared in-memory log for the L2 harness. */
import { DEFAULT_CONFIG, type HapticEvent, type SoundConfig } from './config';
import type { Haptics, HapticsOptions } from './haptics';

export type { Haptics, HapticDriver, HapticsOptions } from './haptics';
export { calmStyle } from './haptics';

const log: { t: number; event: HapticEvent | string; args: unknown[] }[] = [];
export const __hapticLog = (): readonly { t: number; event: string; args: unknown[] }[] => log;

export function createHaptics(_config: SoundConfig = DEFAULT_CONFIG, _opts: HapticsOptions = {}): Haptics {
  const t0 = Date.now();
  const rec = (event: string) => (...args: unknown[]) => void log.push({ t: Date.now() - t0, event, args });
  return {
    fire: rec('fire'),
    setEnabled: rec('setEnabled'),
    setReduced: rec('setReduced'),
    setIntensity: rec('setIntensity'),
    setGeigerRate: rec('setGeigerRate'),
  };
}
