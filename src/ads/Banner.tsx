import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useConsent } from '../state/useConsent';
import { banner } from './index';
import { color } from '../ui/tokens';
import { anchoredAdaptiveHeight } from './bannerSize';

// Native banner slot. The module is required only when a request is allowed, so nothing from the
// SDK loads before consent. The wrapper has the same fixed height with or without an ad.
type Sdk = typeof import('react-native-google-mobile-ads');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sdk = (): Sdk => require('react-native-google-mobile-ads') as Sdk;

export function AdBanner() {
  const { width, height } = useWindowDimensions();
  const consent = useConsent();
  const slotH = anchoredAdaptiveHeight(width, height);
  // Empty: plain housing paint. Filled: a 1 px n4 boundary around the creative; the slot is never tinted.
  const [filled, setFilled] = useState(false);
  const allowed = consent.canRequestAds && banner.enabled();
  const { BannerAd, BannerAdSize } = allowed ? sdk() : ({} as Partial<Sdk>);
  return (
    <View testID="ad-banner-slot" style={[s.slot, { height: slotH }, filled && s.filled]}>
      {allowed && BannerAd && BannerAdSize ? (
        <BannerAd
          unitId={banner.unitId}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          onAdLoaded={() => setFilled(true)}
          onAdFailedToLoad={() => setFilled(false)}
          onSizeChange={(size) => {
            if (__DEV__ && Math.round(size.height) !== anchoredAdaptiveHeight(width, height)) {
              console.warn(`banner: slot assumes ${anchoredAdaptiveHeight(width, height)} dp, the SDK reports ${size.height} dp`);
            }
          }}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  slot: { width: '100%', alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden' },
  filled: { borderWidth: 1, borderColor: color.n4 },
});
