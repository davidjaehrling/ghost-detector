import { useSyncExternalStore } from 'react';
import { type RelayState, relayStore } from './relay';

export function useRelay(): RelayState {
  return useSyncExternalStore(relayStore.subscribe, relayStore.get, relayStore.get);
}
