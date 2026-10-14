import { type ConsentStore, type ConsentSummary, type ConsentStatus, EMPTY_CONSENT } from '../state/consent';

// The ads facade (P5-01, P5-02). The facade is the only path to the Mobile Ads SDK: screens import
// `src/ads`, never `react-native-google-mobile-ads`. Nothing here reaches the backend except
// requestInfoUpdate until that call has resolved in this launch; initialize runs only with
// canRequestAds true; analytics is allowed only on NOT_REQUIRED, or OBTAINED with TCF Purpose 1.

/** What a backend reports after a consent call. */
export type ConsentInfo = {
  status: Exclude<ConsentStatus, 'error'>;
  canRequestAds: boolean;
  privacyOptionsRequired: boolean;
};

export type AdKind = 'rewarded' | 'interstitial' | 'banner';

export interface AdsBackend {
  /** UMP requestInfoUpdate. Runs on every launch. */
  requestInfoUpdate(): Promise<ConsentInfo>;
  /** UMP loadAndShowConsentFormIfRequired, then the refreshed info. Google's own form, never restyled. */
  loadAndShowConsentFormIfRequired(): Promise<ConsentInfo>;
  /** TCF Purpose 1 from AdsConsent.getUserChoices(). */
  purpose1Granted(): Promise<boolean>;
  /** Reopens the privacy options form, then the refreshed info. */
  showPrivacyOptionsForm(): Promise<ConsentInfo>;
  /** setRequestConfiguration then MobileAds().initialize(). The facade calls it only with canRequestAds. */
  initialize(): Promise<void>;
  /** Test unit ID for a slot until launch. */
  unitId(kind: AdKind): string;
}

/**
 * A slot is the place wave 2 (Deep Scan, interstitial, banner) adds load and show. `enabled()` is the
 * only thing a screen may ask before drawing it: false means no request, an empty banner slot, no
 * interstitial load and a disabled DEEP SCAN key.
 */
export type AdSlot = { readonly kind: AdKind; readonly unitId: string; enabled(): boolean };

export type ConsentState = ConsentSummary & {
  /** requestInfoUpdate resolved in this launch. Until then nothing is allowed. */
  resolved: boolean;
};

export type Ads = {
  ensureConsent(): Promise<ConsentState>;
  consentState(): ConsentState;
  canRequestAds(): boolean;
  analyticsAllowed(): boolean;
  showPrivacyOptions(): Promise<ConsentState>;
  initialize(): Promise<boolean>;
  rewarded: AdSlot;
  interstitial: AdSlot;
  banner: AdSlot;
};

const NO_CONSENT: ConsentSummary = { ...EMPTY_CONSENT, status: 'error' };

export function createAds(backend: AdsBackend, store: ConsentStore): Ads {
  let resolved = false;
  let initialized: Promise<boolean> | null = null;
  let pending: Promise<ConsentState> | null = null;

  const state = (): ConsentState => ({ ...store.get(), resolved });
  const canRequestAds = () => resolved && store.get().canRequestAds;
  const analyticsAllowed = () => {
    const c = store.get();
    return resolved && (c.status === 'notRequired' || (c.status === 'obtained' && c.purpose1));
  };

  const commit = async (info: ConsentInfo): Promise<ConsentState> => {
    let purpose1 = false;
    if (info.status === 'obtained') {
      try {
        purpose1 = await backend.purpose1Granted();
      } catch {
        purpose1 = false;
      }
    }
    store.set({ status: info.status, canRequestAds: info.canRequestAds, purpose1, privacyOptionsRequired: info.privacyOptionsRequired });
    resolved = true;
    return state();
  };

  const initialize = (): Promise<boolean> => {
    if (!canRequestAds()) return Promise.resolve(false);
    initialized ??= backend.initialize().then(
      () => true,
      () => {
        initialized = null;
        return false;
      },
    );
    return initialized;
  };

  const run = async (): Promise<ConsentState> => {
    try {
      let info = await backend.requestInfoUpdate();
      info = await backend.loadAndShowConsentFormIfRequired();
      await commit(info);
    } catch {
      // A failed check or form counts as no consent.
      store.set(NO_CONSENT);
      resolved = true;
    }
    await initialize();
    return state();
  };

  const slot = (kind: AdKind): AdSlot => ({
    kind,
    // Read on demand so the SDK module is not touched before consent.
    get unitId() {
      return backend.unitId(kind);
    },
    enabled: () => canRequestAds(),
  });

  return {
    ensureConsent() {
      pending ??= run();
      return pending;
    },
    consentState: state,
    canRequestAds,
    analyticsAllowed,
    async showPrivacyOptions() {
      if (!resolved) return state();
      try {
        await commit(await backend.showPrivacyOptionsForm());
      } catch {
        // keep the last summary
      }
      await initialize();
      return state();
    },
    initialize,
    rewarded: slot('rewarded'),
    interstitial: slot('interstitial'),
    banner: slot('banner'),
  };
}
