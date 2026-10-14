import { useSyncExternalStore } from 'react';
import { type SettingsSnapshot, getSettings, subscribeSettings } from './settings';

export function useSettings(): SettingsSnapshot {
  return useSyncExternalStore(subscribeSettings, getSettings, getSettings);
}
