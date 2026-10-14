import { useSyncExternalStore } from 'react';
import { type ConsentSummary, getConsent, subscribeConsent } from './consent';

export function useConsent(): ConsentSummary {
  return useSyncExternalStore(subscribeConsent, getConsent, getConsent);
}
