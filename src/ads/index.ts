import { consentStore } from '../state/consent';
import { backend } from './backend';
import { createAds } from './core';

export type { AdKind, Ads, AdsBackend, AdSlot, ConsentInfo, ConsentState, FullscreenAd, FullscreenKind, FullscreenSlot, FullscreenStatus } from './core';
export { createAds } from './core';

// `./backend` is the native module on Android and iOS and the logging no-op on web (backend.web.ts).
const ads = createAds(backend, consentStore);

export const ensureConsent = ads.ensureConsent;
export const consentState = ads.consentState;
export const canRequestAds = ads.canRequestAds;
export const analyticsAllowed = ads.analyticsAllowed;
export const showPrivacyOptions = ads.showPrivacyOptions;
export const initialize = ads.initialize;
export const rewarded = ads.rewarded;
export const interstitial = ads.interstitial;
export const banner = ads.banner;
