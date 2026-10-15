import type { Backend, EventParams } from './backend';

// Web: still no network. Every event the facade lets through lands in window.__analyticsLog so the
// L2 harness can assert what would be sent (same pattern as window.__adsLog).
export type { Backend, EventParams } from './backend';

export type AnalyticsLogEntry = { name: string; params: EventParams };

declare global {
  interface Window {
    __analyticsLog?: AnalyticsLogEntry[];
  }
}

export const backend: Backend = {
  setEnabled() {},
  logEvent(name, params) {
    if (typeof window !== 'undefined') (window.__analyticsLog ??= []).push({ name, params });
  },
};
