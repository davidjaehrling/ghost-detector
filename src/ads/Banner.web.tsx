import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color } from '../ui/tokens';
import { BANNER_GAP, bannerSlotHeight } from './bannerSize';

// Web: the slot only. It never requests anything. A hairline frame in the housing colour marks
// where the ad sits on a phone; it carries no text and nothing that reads as an ad.
export function AdBanner() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return <View testID="ad-banner-slot" style={[s.slot, { height: bannerSlotHeight(width, insets.bottom, height) }]} />;
}

const s = StyleSheet.create({
  slot: { width: '100%', marginTop: BANNER_GAP, borderTopWidth: 1, borderTopColor: color.n4, opacity: 0.6 },
});
