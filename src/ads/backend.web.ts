import type { AdKind, AdsBackend, ConsentInfo } from './core';

// Web no-op. Never loads the native module; records every call in window.__adsLog for the L2 harness
// (same pattern as src/audio/engine.web.ts). The consent state is faked from the URL:
//   ?consent=required      the form is "shown" and accepted
//   ?consent=obtained      already obtained
//   ?consent=notRequired   (default) no consent needed
//   ?consent=denied        the form is "shown" and refused: canRequestAds stays false
//   ?consent=error         the form fails to load
//   ?purpose1=0|1          TCF Purpose 1 (default 1)
//   ?privacyOptions=1      the PRIVACY entry is required

export type AdsLogEntry = { t: number; call: string; args: unknown[] };

declare global {
  interface Window {
    __adsLog?: AdsLogEntry[];
  }
}

const t0 = Date.now();

function record(call: string, args: unknown[] = []): void {
  if (typeof window === 'undefined') return;
  (window.__adsLog ??= []).push({ t: Date.now() - t0, call, args });
}

function query(): URLSearchParams {
  return new URLSearchParams(typeof window !== 'undefined' ? (window.location?.search ?? '') : '');
}

type Mode = 'required' | 'obtained' | 'notRequired' | 'denied' | 'error';

function mode(): Mode {
  const m = query().get('consent');
  return m === 'required' || m === 'obtained' || m === 'denied' || m === 'error' ? m : 'notRequired';
}

// The form has been through once this page load.
let formDone = false;

function info(): ConsentInfo {
  const m = mode();
  const privacy = query().get('privacyOptions') === '1' || (m !== 'notRequired' && m !== 'error');
  switch (m) {
    case 'notRequired':
      return { status: 'notRequired', canRequestAds: true, privacyOptionsRequired: privacy };
    case 'obtained':
      return { status: 'obtained', canRequestAds: true, privacyOptionsRequired: privacy };
    case 'required':
      return formDone
        ? { status: 'obtained', canRequestAds: true, privacyOptionsRequired: privacy }
        : { status: 'required', canRequestAds: false, privacyOptionsRequired: privacy };
    case 'denied':
      return { status: 'required', canRequestAds: false, privacyOptionsRequired: privacy };
    case 'error':
      return { status: 'unknown', canRequestAds: false, privacyOptionsRequired: false };
  }
}

export const backend: AdsBackend = {
  async requestInfoUpdate() {
    record('requestInfoUpdate');
    return info();
  },
  async loadAndShowConsentFormIfRequired() {
    record('loadAndShowConsentFormIfRequired');
    if (mode() === 'error') throw new Error('consent form failed to load');
    if (mode() === 'required') formDone = true;
    return info();
  },
  async purpose1Granted() {
    record('getUserChoices');
    return query().get('purpose1') !== '0';
  },
  async showPrivacyOptionsForm() {
    record('showPrivacyOptionsForm');
    return info();
  },
  async initialize() {
    record('setRequestConfiguration', [{ tagForChildDirectedTreatment: false, tagForUnderAgeOfConsent: false, maxAdContentRating: 'T' }]);
    record('initialize');
  },
  unitId(kind: AdKind) {
    return `test-${kind}`;
  },
};
