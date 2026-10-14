import { type KeyValueStore, webStorage } from './scans';

// Consent summary (P5-02). The UMP SDK is the source of truth and is re-read on every launch; this
// store keeps the last summary so Settings can draw the PRIVACY row before the check returns, and so
// the answer survives a reload on web. Same storage approach as scans: memory, mirrored to
// localStorage where it exists. Persisted values never open the gate: src/ads/core.ts only trusts
// a summary once requestInfoUpdate has resolved in this launch.

export type ConsentStatus = 'unknown' | 'required' | 'obtained' | 'notRequired' | 'error';

export type ConsentSummary = {
  status: ConsentStatus;
  canRequestAds: boolean;
  /** TCF Purpose 1 (store and access information on a device) granted. */
  purpose1: boolean;
  privacyOptionsRequired: boolean;
};

export const EMPTY_CONSENT: ConsentSummary = { status: 'unknown', canRequestAds: false, purpose1: false, privacyOptionsRequired: false };

const KEY = 'fs4.consent.v1';
const STATUSES: readonly ConsentStatus[] = ['unknown', 'required', 'obtained', 'notRequired', 'error'];

export function createConsentStore(storage: KeyValueStore | null = webStorage()) {
  let snap: ConsentSummary | null = null;
  const listeners = new Set<() => void>();

  const load = (): ConsentSummary => {
    if (snap) return snap;
    snap = EMPTY_CONSENT;
    try {
      const raw: unknown = JSON.parse(storage?.getItem(KEY) ?? 'null');
      if (raw && typeof raw === 'object') {
        const r = raw as Record<string, unknown>;
        if (STATUSES.includes(r.status as ConsentStatus)) {
          snap = {
            status: r.status as ConsentStatus,
            canRequestAds: r.canRequestAds === true,
            purpose1: r.purpose1 === true,
            privacyOptionsRequired: r.privacyOptionsRequired === true,
          };
        }
      }
    } catch {
      snap = EMPTY_CONSENT;
    }
    return snap;
  };

  return {
    /** A stable object until set() runs (safe for useSyncExternalStore). */
    get: load,
    set(next: ConsentSummary) {
      snap = { ...next };
      try {
        storage?.setItem(KEY, JSON.stringify(snap));
      } catch {
        // memory only
      }
      for (const l of listeners) l();
    },
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

export type ConsentStore = ReturnType<typeof createConsentStore>;

const store = createConsentStore();
export const getConsent = store.get;
export const setConsent = store.set;
export const subscribeConsent = store.subscribe;
export const consentStore: ConsentStore = store;
