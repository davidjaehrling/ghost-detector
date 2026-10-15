import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius as tokenRadius } from '../../ui/tokens';
import { BurnIn, type BurnInLabels } from './BurnIn';
import { GlassOverlay, type GlassLayerFlags } from './GlassOverlay';
import { GlassWarp } from './GlassWarp';
import { WarmUp } from './WarmUp';
import '../perf/frameCounter'; // installs window.__fxFrames on web (idle until a harness starts it)

export type GlassProps = GlassLayerFlags & {
  children: ReactNode;
  // false (default): flat overlay, for live content (viewfinder camera, scan theatre).
  // true: barrel-warped snapshot, for static-ish screens (boot, result); see <GlassWarp>.
  warp?: boolean;
  // With `warp`: change it to re-snapshot the children.
  refreshKey?: string | number;
  // With `warp`: see GlassWarp `onSnapshot` (String(refreshKey) once each snapshot has landed).
  onSnapshot?: (key: string) => void;
  // Play the 900 ms power-on over the glass (boot). Change `warmUpKey` to play it again.
  warmUp?: boolean;
  warmUpKey?: string | number;
  onWarmUpDone?: () => void;
  burnIn?: boolean;
  burnInLabels?: Partial<BurnInLabels>;
  seed?: number;
  static?: boolean;
  reduceMotion?: boolean;
  intensity?: number;
  grainHz?: number;
  grainScale?: 1 | 2;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

// The one glass component for the four screens: the window content, the burn-in ghost, the
// glass layers (flat or warped) and, on boot, the warm-up. Size and place it with `style`
// like the window it replaces (Bible §2: 362 x 420, radius 18).
export function Glass({
  children,
  warp = false,
  refreshKey,
  onSnapshot,
  warmUp = false,
  warmUpKey,
  onWarmUpDone,
  burnIn = true,
  burnInLabels,
  reduceMotion = false,
  radius = tokenRadius.window,
  style,
  testID,
  ...layers
}: GlassProps) {
  const burn = burnIn ? <BurnIn labels={burnInLabels} /> : null;
  const warm = warmUp ? <WarmUp static={layers.static} reduceMotion={reduceMotion} runKey={warmUpKey} onDone={onWarmUpDone} /> : null;
  if (warp) {
    return (
      <View testID={testID} style={[styles.window, { borderRadius: radius }, style]}>
        <GlassWarp testID={testID ? `${testID}-warp` : undefined} refreshKey={refreshKey} onSnapshot={onSnapshot} radius={radius} style={StyleSheet.absoluteFill} {...layers}>
          {children}
        </GlassWarp>
        {burn}
        {warm}
      </View>
    );
  }
  return (
    <View testID={testID} style={[styles.window, { borderRadius: radius }, style]}>
      {children}
      {burn}
      <GlassOverlay radius={radius} {...layers} />
      {warm}
    </View>
  );
}

const styles = StyleSheet.create({
  window: { overflow: 'hidden' },
});
