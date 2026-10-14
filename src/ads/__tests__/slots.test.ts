import { describe, expect, it } from 'vitest';
import { createConsentStore } from '../../state/consent';
import { type AdsBackend, type ConsentInfo, type FullscreenAd, createAds } from '../core';
import { ADAPTIVE_MIN_HEIGHT, anchoredAdaptiveHeight, bannerSlotHeight } from '../bannerSize';

const ok: ConsentInfo = { status: 'notRequired', canRequestAds: true, privacyOptionsRequired: false };
const denied: ConsentInfo = { status: 'required', canRequestAds: false, privacyOptionsRequired: true };

function rig(info: ConsentInfo, ad: Partial<{ load: boolean; earned: boolean; shown: boolean }> = {}) {
  const calls: string[] = [];
  const backend: AdsBackend = {
    requestInfoUpdate: async () => info,
    loadAndShowConsentFormIfRequired: async () => info,
    purpose1Granted: async () => true,
    showPrivacyOptionsForm: async () => info,
    initialize: async () => void calls.push('initialize'),
    unitId: (k) => `test-${k}`,
    fullscreen: (kind): FullscreenAd => {
      calls.push(`create:${kind}`);
      return {
        load: async () => {
          calls.push(`load:${kind}`);
          return ad.load ?? true;
        },
        show: async () => {
          calls.push(`show:${kind}`);
          return { shown: ad.shown ?? true, earned: ad.earned ?? false };
        },
      };
    },
  };
  return { ads: createAds(backend, createConsentStore(null)), calls };
}

describe('rewarded and interstitial slots', () => {
  it('request nothing before consent resolves', async () => {
    const { ads, calls } = rig(ok);
    expect(await ads.rewarded.load()).toBe(false);
    expect(await ads.interstitial.load()).toBe(false);
    expect(calls).toEqual([]);
    expect(ads.rewarded.status()).toBe('idle');
  });

  it('request nothing when consent leaves canRequestAds false', async () => {
    const { ads, calls } = rig(denied);
    await ads.ensureConsent();
    expect(await ads.rewarded.load()).toBe(false);
    expect((await ads.rewarded.show()).shown).toBe(false);
    expect(calls).not.toContain('create:rewarded');
  });

  it('load then show: ready, one show, the slot is spent', async () => {
    const { ads, calls } = rig(ok, { earned: true });
    await ads.ensureConsent();
    expect(await ads.rewarded.load()).toBe(true);
    expect(ads.rewarded.status()).toBe('ready');
    expect(await ads.rewarded.show()).toEqual({ shown: true, earned: true });
    expect(ads.rewarded.status()).toBe('idle');
    expect(await ads.rewarded.show()).toEqual({ shown: false, earned: false });
    expect(calls.filter((c) => c === 'show:rewarded')).toHaveLength(1);
  });

  it('show without a loaded ad does nothing', async () => {
    const { ads, calls } = rig(ok);
    await ads.ensureConsent();
    expect(await ads.interstitial.show()).toEqual({ shown: false, earned: false });
    expect(calls).not.toContain('show:interstitial');
  });

  it('a failed load reports failed and a second request is allowed', async () => {
    const { ads } = rig(ok, { load: false });
    await ads.ensureConsent();
    expect(await ads.rewarded.load()).toBe(false);
    expect(ads.rewarded.status()).toBe('failed');
    expect(await ads.rewarded.load()).toBe(false);
  });

  it('two loads at once make one request', async () => {
    const { ads, calls } = rig(ok);
    await ads.ensureConsent();
    await Promise.all([ads.interstitial.load(), ads.interstitial.load()]);
    expect(calls.filter((c) => c === 'load:interstitial')).toHaveLength(1);
  });

  it('notifies subscribers on every status change', async () => {
    const { ads } = rig(ok);
    await ads.ensureConsent();
    const seen: string[] = [];
    ads.rewarded.subscribe(() => seen.push(ads.rewarded.status()));
    await ads.rewarded.load();
    await ads.rewarded.show();
    expect(seen).toEqual(['loading', 'ready', 'idle']);
  });
});

describe('banner slot height', () => {
  it('is the adaptive height for the width plus the bottom inset', () => {
    expect(bannerSlotHeight(390, 0)).toBe(anchoredAdaptiveHeight(390));
    expect(bannerSlotHeight(390, 34)).toBe(anchoredAdaptiveHeight(390) + 34);
  });
  it('never drops under the 50 dp minimum and grows with width', () => {
    expect(anchoredAdaptiveHeight(240)).toBe(ADAPTIVE_MIN_HEIGHT);
    expect(anchoredAdaptiveHeight(428)).toBeGreaterThan(anchoredAdaptiveHeight(360));
  });
  it('is capped at 15% of a short screen', () => {
    expect(anchoredAdaptiveHeight(428, 300)).toBe(ADAPTIVE_MIN_HEIGHT);
  });
});
