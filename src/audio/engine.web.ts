/** Web no-op. Creates no AudioContext; records every call for the L2 harness. */
import type { SoundConfig } from './config';
import type { AudioEngine, AudioLogEntry, EngineHooks } from './types';

const log: AudioLogEntry[] = [];

/** Calls recorded since the page loaded (all engines). Playwright reads `window.__audioLog?.()` if exposed. */
export const __audioLog = (): readonly AudioLogEntry[] => log;
export const __clearAudioLog = (): void => {
  log.length = 0;
};

export function createAudioEngine(_config?: SoundConfig, _hooks?: EngineHooks): AudioEngine {
  const t0 = Date.now();
  const rec =
    <A extends unknown[]>(call: string) =>
    (...args: A) => {
      log.push({ t: Date.now() - t0, call, args });
    };
  return {
    start: rec('start'),
    stop: rec('stop'),
    setTier: rec('setTier'),
    setIntensity: rec('setIntensity'),
    setFlux: rec('setFlux'),
    scanPhase: rec('scanPhase'),
    hold: rec('hold'),
    reveal: rec('reveal'),
    scare: rec('scare'),
    fault: rec('fault'),
    setReduced: rec('setReduced'),
    dispose: rec('dispose'),
  };
}
