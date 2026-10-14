import { describe, expect, it } from 'vitest';
import type { Intensity } from '../../engine';
import { CALM_LINE, createSettingsStore, jumpScaresDefault } from '../settings';
import type { KeyValueStore } from '../scans';

const mem = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

describe('settings', () => {
  it('defaults: sound and haptics on; jump scares on for Standard and Brave, off for Calm', () => {
    for (const [i, scares] of [['standard', true], ['brave', true], ['calm', false]] as const) {
      expect(createSettingsStore(null, () => i).get()).toEqual({ sound: true, haptics: true, jumpScares: scares });
      expect(jumpScaresDefault(i)).toBe(scares);
    }
  });

  it('stores each switch and reads it back', () => {
    const storage = mem();
    const a = createSettingsStore(storage, () => 'standard');
    a.setSound(false);
    a.setHaptics(false);
    a.setJumpScares(false);
    expect(createSettingsStore(storage, () => 'standard').get()).toEqual({ sound: false, haptics: false, jumpScares: false });
  });

  it('locks jump scares OFF on Calm whatever is stored, and restores the choice on Standard', () => {
    let intensity: Intensity = 'standard';
    const s = createSettingsStore(null, () => intensity);
    expect(s.setJumpScares(true)).toBe(true);
    intensity = 'calm';
    expect(s.get().jumpScares).toBe(false);
    expect(s.setJumpScares(true)).toBe(false);
    expect(CALM_LINE).toBe('CALM MODE. SCARE CIRCUIT DISABLED.');
    intensity = 'brave';
    expect(s.get().jumpScares).toBe(true);
  });

  it('gives a stable snapshot until something changes, and tells subscribers', () => {
    const s = createSettingsStore(null, () => 'standard');
    const a = s.get();
    expect(s.get()).toBe(a);
    let n = 0;
    const off = s.subscribe(() => n++);
    s.setSound(false);
    expect(n).toBe(1);
    expect(s.get()).not.toBe(a);
    off();
    s.setSound(true);
    expect(n).toBe(1);
  });

  it('ignores a damaged store', () => {
    const storage = mem();
    storage.setItem('fs4.settings.v1', '{"sound":"no","haptics":7');
    expect(createSettingsStore(storage, () => 'standard').get()).toEqual({ sound: true, haptics: true, jumpScares: true });
  });
});
