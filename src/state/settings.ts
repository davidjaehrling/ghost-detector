import type { Intensity } from '../engine';
import { type KeyValueStore, getIntensity, webStorage } from './scans';

// Settings (docs/sound-palette.md section 8, psych-brief 3): SOUND, HAPTICS and JUMP SCARES.
// Sound and haptics default ON. Jump scares default ON for Standard and Brave, and are locked OFF
// on Calm: the stored choice is kept, but Calm reads OFF whatever it says. Stored on the device.

export type SettingsSnapshot = { sound: boolean; haptics: boolean; jumpScares: boolean };

export const CALM_LINE = 'CALM MODE. SCARE CIRCUIT DISABLED.';

const KEY = 'fs4.settings.v1';
type Stored = { sound?: boolean; haptics?: boolean; jumpScares?: boolean };

export function jumpScaresDefault(intensity: Intensity): boolean {
  return intensity !== 'calm';
}

export function createSettingsStore(storage: KeyValueStore | null = webStorage(), intensityOf: () => Intensity = getIntensity) {
  let stored: Stored | null = null;
  let snap: SettingsSnapshot | null = null;
  let lastIntensity: Intensity | null = null;
  const listeners = new Set<() => void>();

  const load = (): Stored => {
    if (stored) return stored;
    stored = {};
    try {
      const raw: unknown = JSON.parse(storage?.getItem(KEY) ?? '{}');
      if (raw && typeof raw === 'object') {
        const r = raw as Record<string, unknown>;
        for (const k of ['sound', 'haptics', 'jumpScares'] as const) if (typeof r[k] === 'boolean') stored[k] = r[k];
      }
    } catch {
      // memory only
    }
    return stored;
  };
  const save = () => {
    try {
      storage?.setItem(KEY, JSON.stringify(stored ?? {}));
    } catch {
      // memory only
    }
  };
  const compute = (): SettingsSnapshot => {
    const s = load();
    const intensity = intensityOf();
    return { sound: s.sound ?? true, haptics: s.haptics ?? true, jumpScares: intensity === 'calm' ? false : (s.jumpScares ?? jumpScaresDefault(intensity)) };
  };
  const emit = () => {
    snap = null;
    for (const l of listeners) l();
  };

  return {
    /** A stable object until something changes (safe for useSyncExternalStore). */
    get(): SettingsSnapshot {
      const intensity = intensityOf();
      if (!snap || lastIntensity !== intensity) {
        snap = compute();
        lastIntensity = intensity;
      }
      return snap;
    },
    setSound(on: boolean) {
      load().sound = on;
      save();
      emit();
    },
    setHaptics(on: boolean) {
      load().haptics = on;
      save();
      emit();
    },
    /** Returns the value now in force: on Calm it stays OFF and the caller shows CALM_LINE. */
    setJumpScares(on: boolean): boolean {
      load().jumpScares = on;
      save();
      emit();
      return this.get().jumpScares;
    },
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

const store = createSettingsStore();
export const getSettings = store.get;
export const setSound = store.setSound;
export const setHaptics = store.setHaptics;
export const setJumpScares = store.setJumpScares.bind(store);
export const subscribeSettings = store.subscribe;
