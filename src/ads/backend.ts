import type { AdKind, AdsBackend, ConsentInfo } from './core';

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
    const { TestIds } = sdk();
    return kind === 'rewarded' ? TestIds.REWARDED : kind === 'interstitial' ? TestIds.INTERSTITIAL : TestIds.BANNER;
  },
};
