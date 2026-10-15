import { describe, expect, it } from 'vitest';
import { createConsentStore } from '../../state/consent';
import { type AdsBackend, type ConsentInfo, createAds } from '../core';

type Script = {
  update: ConsentInfo | Error;
  form?: ConsentInfo | Error;
  purpose1?: boolean | Error;
  privacy?: ConsentInfo;
};

const info = (status: ConsentInfo['status'], canRequestAds: boolean, privacyOptionsRequired = false): ConsentInfo => ({ status, canRequestAds, privacyOptionsRequired });

function fake(script: Script, gate?: Promise<void>) {
  const calls: string[] = [];
  const settle = <T>(v: T | Error): Promise<T> => (v instanceof Error ? Promise.reject(v) : Promise.resolve(v));
  const backend: AdsBackend = {
    async requestInfoUpdate() {
      calls.push('requestInfoUpdate');
      await gate;
      return settle(script.update);
    },
    loadAndShowConsentFormIfRequired() {
      calls.push('form');
      return settle(script.form ?? script.update);
    },
    purpose1Granted() {
      calls.push('getUserChoices');
      return settle(script.purpose1 ?? false);
    },
    showPrivacyOptionsForm() {
      calls.push('privacyOptions');
      return settle(script.privacy ?? (script.form instanceof Error ? script.update : (script.form ?? script.update)) as ConsentInfo);
    },
    async initialize() {
      calls.push('initialize');
    },
    unitId: (k) => `test-${k}`,
    fullscreen: () => ({ load: async () => true, show: async () => ({ shown: true, earned: false }) }),
  };
  const store = createConsentStore(null);
  return { ads: createAds(backend, store), calls, store };
}

describe('consent gate', () => {
  it('NOT_REQUIRED: initializes, analytics allowed, no choices read', async () => {
    const { ads, calls } = fake({ update: info('notRequired', true) });
    const s = await ads.ensureConsent();
    expect(s).toMatchObject({ status: 'notRequired', canRequestAds: true, purpose1: false, resolved: true });
    expect(ads.analyticsAllowed()).toBe(true);
    expect(ads.canRequestAds()).toBe(true);
    expect(calls).toEqual(['requestInfoUpdate', 'form', 'initialize']);
  });

  it('REQUIRED then OBTAINED with purpose 1 on: ads and analytics allowed', async () => {
    const { ads, calls } = fake({ update: info('required', false), form: info('obtained', true, true), purpose1: true });
    await ads.ensureConsent();
    expect(ads.canRequestAds()).toBe(true);
    expect(ads.analyticsAllowed()).toBe(true);
    expect(ads.consentState().privacyOptionsRequired).toBe(true);
    expect(calls).toEqual(['requestInfoUpdate', 'form', 'getUserChoices', 'initialize']);
  });

  it('REQUIRED then OBTAINED with purpose 1 off: ads yes, analytics no', async () => {
    const { ads } = fake({ update: info('required', false), form: info('obtained', true), purpose1: false });
    await ads.ensureConsent();
    expect(ads.canRequestAds()).toBe(true);
    expect(ads.analyticsAllowed()).toBe(false);
  });

  it('a failed purpose read counts as purpose 1 off', async () => {
    const { ads } = fake({ update: info('obtained', true), purpose1: new Error('tc string') });
    await ads.ensureConsent();
    expect(ads.analyticsAllowed()).toBe(false);
    expect(ads.canRequestAds()).toBe(true);
  });

  it('REQUIRED and denied: no initialize, no ads, no analytics, slots disabled', async () => {
    const { ads, calls } = fake({ update: info('required', false) });
    await ads.ensureConsent();
    expect(calls).toEqual(['requestInfoUpdate', 'form']);
    expect(ads.canRequestAds()).toBe(false);
    expect(ads.analyticsAllowed()).toBe(false);
    expect(ads.banner.enabled() || ads.interstitial.enabled() || ads.rewarded.enabled()).toBe(false);
    expect(await ads.initialize()).toBe(false);
    expect(calls).not.toContain('initialize');
  });

  it('UNKNOWN: nothing allowed', async () => {
    const { ads, calls } = fake({ update: info('unknown', false) });
    await ads.ensureConsent();
    expect(calls).not.toContain('initialize');
    expect(ads.analyticsAllowed()).toBe(false);
    expect(ads.canRequestAds()).toBe(false);
  });

  it('UNKNOWN never allows analytics even if the SDK claims canRequestAds', async () => {
    const { ads } = fake({ update: info('unknown', true), purpose1: true });
    await ads.ensureConsent();
    expect(ads.analyticsAllowed()).toBe(false);
  });

  it('form error counts as no consent', async () => {
    const { ads, calls } = fake({ update: info('required', false), form: new Error('form') });
    const s = await ads.ensureConsent();
    expect(s).toMatchObject({ status: 'error', canRequestAds: false, resolved: true });
    expect(calls).not.toContain('initialize');
    expect(ads.analyticsAllowed()).toBe(false);
  });

  it('requestInfoUpdate error counts as no consent', async () => {
    const { ads, calls } = fake({ update: new Error('network') });
    await ads.ensureConsent();
    expect(calls).toEqual(['requestInfoUpdate']);
    expect(ads.canRequestAds()).toBe(false);
  });

  it('before requestInfoUpdate resolves nothing reaches the backend and nothing is allowed, even with a persisted yes', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const { ads, calls, store } = fake({ update: info('obtained', true), purpose1: true }, gate);
    store.set({ status: 'obtained', canRequestAds: true, purpose1: true, privacyOptionsRequired: false });
    const p = ads.ensureConsent();
    expect(calls).toEqual(['requestInfoUpdate']);
    expect(ads.canRequestAds()).toBe(false);
    expect(ads.analyticsAllowed()).toBe(false);
    expect(ads.rewarded.enabled()).toBe(false);
    expect(await ads.initialize()).toBe(false);
    expect(calls).toEqual(['requestInfoUpdate']);
    open();
    await p;
    expect(ads.canRequestAds()).toBe(true);
    expect(ads.analyticsAllowed()).toBe(true);
  });

  it('runs once per launch and initializes once', async () => {
    const { ads, calls } = fake({ update: info('notRequired', true) });
    await Promise.all([ads.ensureConsent(), ads.ensureConsent()]);
    await ads.initialize();
    expect(calls.filter((c) => c === 'requestInfoUpdate')).toHaveLength(1);
    expect(calls.filter((c) => c === 'initialize')).toHaveLength(1);
  });

  it('persists the summary', async () => {
    const { ads, store } = fake({ update: info('obtained', true, true), purpose1: true });
    await ads.ensureConsent();
    expect(store.get()).toEqual({ status: 'obtained', canRequestAds: true, purpose1: true, privacyOptionsRequired: true });
  });

  it('showPrivacyOptions refreshes the summary and can revoke ads', async () => {
    const { ads } = fake({ update: info('obtained', true, true), purpose1: true, privacy: info('required', false, true) });
    await ads.ensureConsent();
    const s = await ads.showPrivacyOptions();
    expect(s.canRequestAds).toBe(false);
    expect(ads.canRequestAds()).toBe(false);
  });

  it('showPrivacyOptions does nothing before consent resolved', async () => {
    const { ads, calls } = fake({ update: info('obtained', true, true) });
    await ads.showPrivacyOptions();
    expect(calls).toEqual([]);
  });
});

describe('consent info timeout', () => {
  it('an info update that never answers counts as no consent and opens no request', async () => {
    const store = createConsentStore(null);
    const calls: string[] = [];
    const never = new Promise<ConsentInfo>(() => {});
    const ads = createAds(
      {
        consentTimeoutMs: 20,
        requestInfoUpdate: () => never,
        loadAndShowConsentFormIfRequired: () => never,
        purpose1Granted: async () => true,
        showPrivacyOptionsForm: () => never,
        initialize: async () => void calls.push('initialize'),
        unitId: (k) => `test-${k}`,
        fullscreen: () => ({ load: async () => true, show: async () => ({ shown: true, earned: false }) }),
      },
      store,
    );
    const s = await ads.ensureConsent();
    expect(s).toMatchObject({ status: 'error', canRequestAds: false, resolved: true });
    expect(ads.analyticsAllowed()).toBe(false);
    expect(calls).toEqual([]);
  });
});
