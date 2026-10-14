// Live AdMob unit IDs. Replace each placeholder with the real ID from the AdMob console before the
// first production build. Release mode (EXPO_PUBLIC_RELEASE=1) uses these and never the SDK TestIds;
// scripts/check-ad-ids.mjs fails a release build while any REPLACE_WITH_LIVE_ placeholder remains.
export const LIVE_UNITS = {
  rewarded: 'REPLACE_WITH_LIVE_REWARDED_ID',
  interstitial: 'REPLACE_WITH_LIVE_INTERSTITIAL_ID',
  banner: 'REPLACE_WITH_LIVE_BANNER_ID',
} as const;

/** True in a production build (eas.json production profile sets EXPO_PUBLIC_RELEASE=1). */
export function releaseMode(): boolean {
  return process.env.EXPO_PUBLIC_RELEASE === '1';
}
