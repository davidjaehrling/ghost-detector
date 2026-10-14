import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConsent } from '../state/useConsent';
import { banner } from './index';
import { BANNER_GAP, anchoredAdaptiveHeight, bannerSlotHeight } from './bannerSize';

// Native banner slot. The module is required only when a request is allowed, so nothing from the
// SDK loads before consent. The wrapper has the same fixed height with or without an ad.
type Sdk = typeof import('react-native-google-mobile-ads');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sdk = (): Sdk => require('react-native-google-mobile-ads') as Sdk;

export function AdBanner() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const consent = useConsent();
  const slotH = bannerSlotHeight(width, insets.bottom, height);
  const allowed = consent.canRequestAds && banner.enabled();
  const { BannerAd, BannerAdSize } = allowed ? sdk() : ({} as Partial<Sdk>);
  return (
    <View testID="ad-banner-slot" style={[s.slot, { height: slotH, paddingBottom: insets.bottom }]}>
      {allowed && BannerAd && BannerAdSize ? (
        <BannerAd
          unitId={banner.unitId}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
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
  slot: { width: '100%', marginTop: BANNER_GAP, alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden' },
});
