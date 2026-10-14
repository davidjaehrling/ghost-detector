import { LIVE_UNITS, releaseMode } from './adUnits';
import type { AdKind, AdsBackend, ConsentInfo, FullscreenAd, FullscreenKind } from './core';

// Native backend: the only file that touches react-native-google-mobile-ads. The module is required
// on first use, not at import, so nothing from the SDK loads before the facade asks. Web uses
// backend.web.ts and never reaches this file.

type Sdk = typeof import('react-native-google-mobile-ads');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sdk = (): Sdk => require('react-native-google-mobile-ads') as Sdk;

async function info(): Promise<ConsentInfo> {
  const { AdsConsent, AdsConsentPrivacyOptionsRequirementStatus } = sdk();
  const c = await AdsConsent.getConsentInfo();
  const status = String(c.status);
  return {
    status: status === 'OBTAINED' ? 'obtained' : status === 'NOT_REQUIRED' ? 'notRequired' : status === 'REQUIRED' ? 'required' : 'unknown',
    canRequestAds: c.canRequestAds,
    privacyOptionsRequired: c.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
  };
}

export const backend: AdsBackend = {
  async requestInfoUpdate() {
    // Not under age of consent; no debug geography or test devices in the shipped path.
    await sdk().AdsConsent.requestInfoUpdate({ tagForUnderAgeOfConsent: false });
    return info();
  },
  async loadAndShowConsentFormIfRequired() {
    await sdk().AdsConsent.loadAndShowConsentFormIfRequired();
    return info();
  },
  async purpose1Granted() {
    const choices = await sdk().AdsConsent.getUserChoices();
    return choices.storeAndAccessInformationOnDevice;
  },
  async showPrivacyOptionsForm() {
    await sdk().AdsConsent.showPrivacyOptionsForm();
    return info();
  },
  async initialize() {
    const { default: MobileAds, MaxAdContentRating } = sdk();
    await MobileAds().setRequestConfiguration({
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
      maxAdContentRating: MaxAdContentRating.T,
    });
    await MobileAds().initialize();
  },
  unitId(kind: AdKind) {
    // Release mode never touches TestIds; outside it the SDK test units are used.
    if (releaseMode()) return LIVE_UNITS[kind];
    const { TestIds } = sdk();
    return kind === 'rewarded' ? TestIds.REWARDED : kind === 'interstitial' ? TestIds.INTERSTITIAL : TestIds.ADAPTIVE_BANNER;
  },
  fullscreen(kind: FullscreenKind): FullscreenAd {
    const { RewardedAd, InterstitialAd, AdEventType, RewardedAdEventType } = sdk();
    const unit = backend.unitId(kind);
    const ad = kind === 'rewarded' ? RewardedAd.createForAdRequest(unit) : InterstitialAd.createForAdRequest(unit);
    const on = ad as { addAdEventListener(type: import('react-native-google-mobile-ads').AdEventType, listener: (arg?: unknown) => void): () => void };
    // Every listener this object adds is removed when its promise settles.
    return {
      load: () =>
        new Promise<boolean>((resolve) => {
          const offs: (() => void)[] = [];
          const done = (ok: boolean) => {
            for (const off of offs) off();
            resolve(ok);
          };
          if (ad instanceof RewardedAd) offs.push(ad.addAdEventListener(RewardedAdEventType.LOADED, () => done(true)));
          else offs.push(on.addAdEventListener(AdEventType.LOADED, () => done(true)));
          offs.push(on.addAdEventListener(AdEventType.ERROR, () => done(false)));
          try {
            ad.load();
          } catch {
            done(false);
          }
        }),
      show: () =>
        new Promise<{ shown: boolean; earned: boolean }>((resolve) => {
          const offs: (() => void)[] = [];
          let shown = false;
          let earned = false;
          const done = () => {
            for (const off of offs) off();
            resolve({ shown, earned });
          };
          if (ad instanceof RewardedAd) offs.push(ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => (earned = true)));
          offs.push(on.addAdEventListener(AdEventType.OPENED, () => (shown = true)));
          offs.push(on.addAdEventListener(AdEventType.CLOSED, done));
          offs.push(on.addAdEventListener(AdEventType.ERROR, done));
          ad.show().catch(done);
        }),
    };
  },
};
