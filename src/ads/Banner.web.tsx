import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { anchoredAdaptiveHeight } from './bannerSize';

// Web: the slot only. It never requests anything. Empty it is plain housing paint: no seam, no frame,
// nothing that reads as an ad. The screen places it between the window and the key row.
export function AdBanner() {
  const { width, height } = useWindowDimensions();
  return <View testID="ad-banner-slot" style={[s.slot, { height: anchoredAdaptiveHeight(width, height) }]} />;
}

const s = StyleSheet.create({
  slot: { width: '100%' },
});
