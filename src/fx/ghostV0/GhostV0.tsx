import { useEffect, useState } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, type ImageSourcePropType } from 'react-native';

import { ghostTint, type Placement } from './placement';

const MATTES: Record<Placement['matte'], ImageSourcePropType> = {
  1: require('../../../assets/ghost/matte-1.png'),
  2: require('../../../assets/ghost/matte-2.png'),
  3: require('../../../assets/ghost/matte-3.png'),
};

/**
 * Matte grey under the Screen blend. Screen gives out = b + A * s * (255 - b) / 255 for a
 * backdrop b, layer alpha A and grey s, so it only ever adds light, most over black, least over
 * near-white. s below white keeps the brightest stacked pixel from clipping.
 */
export const SCREEN_GREY = 0xff;
const SCREEN_HEX = `#${SCREEN_GREY.toString(16).repeat(3)}`;

/** `screen`: add light with the platform blend mode. `tint`: normal alpha with a grey above the region (fallback). */
export type GhostBlend = 'screen' | 'tint';

export interface GhostV0Props {
  /** From `placeGhost`, in the same pixel space as the parent view. */
  placement: Placement;
  /** Mean luma of the dark region, 0..255 (from `regionFromImage` or the engine). */
  regionMeanLuma: number;
  /** 90th-percentile luma of the region (`RegionResult.p90Luma`). Tint fallback only; estimated from the mean when absent. */
  regionP90Luma?: number;
  /** Linear fade from 0 to full opacity on mount, in ms. 0 (default) shows the final state at once. */
  fadeInMs?: number;
  /** Render nothing. On web `?ghost=0` sets it too (L2 measurement harness). */
  disabled?: boolean;
  /** Force a blend path. Default: Screen where supported. On web `?ghostblend=tint` forces the fallback. */
  blend?: GhostBlend;
}

type WebQuery = { off: boolean; isStatic: boolean; blend: GhostBlend | null };

function webQuery(): WebQuery {
  const none: WebQuery = { off: false, isStatic: false, blend: null };
  if (Platform.OS !== 'web' || typeof window === 'undefined') return none;
  const q = new URLSearchParams(window.location?.search ?? '');
  const b = q.get('ghostblend');
  return { off: q.get('ghost') === '0', isStatic: q.get('static') === '1', blend: b === 'tint' || b === 'screen' ? b : null };
}

function screenSupported(): boolean {
  if (Platform.OS !== 'web') return true; // RN 0.77+ new architecture: `mixBlendMode` on views
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('mix-blend-mode', 'screen');
}

/**
 * v0 compositor: plain RN images over the photo. The figure and its offset copies (the stand-in
 * for blur) stack with normal alpha inside one layer; that layer is Screen-blended onto the photo,
 * so the apparition adds light and never darkens. Without blend modes it falls back to a grey
 * tint above the region's 90th-percentile luma. Render it as a sibling layered above the photo,
 * inside a view of the photo's size; the layer must not sit inside an isolated group of its own.
 */
export function GhostV0({ placement, regionMeanLuma, regionP90Luma, fadeInMs = 0, disabled, blend }: GhostV0Props) {
  const [query] = useState(webQuery);
  const animate = fadeInMs > 0 && !query.isStatic;
  const [fade] = useState(() => new Animated.Value(animate ? 0 : 1));

  useEffect(() => {
    if (!animate) return;
    const anim = Animated.timing(fade, {
      toValue: 1,
      duration: fadeInMs,
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== 'web',
    });
    anim.start();
    return () => anim.stop();
  }, [animate, fade, fadeInMs]);

  if (disabled || query.off) return null;

  const mode: GhostBlend = blend ?? query.blend ?? (screenSupported() ? 'screen' : 'tint');
  const { x, y, w, h, matte, opacity, flipX, offsetCopies } = placement;
  const tint = mode === 'screen' ? SCREEN_HEX : ghostTint(regionP90Luma ?? regionMeanLuma + 30).hex;
  const source = MATTES[matte];
  const flip = flipX ? [{ scaleX: -1 }] : undefined;
  // Farthest copy first so the main figure lands on top.
  const layers = [...offsetCopies].reverse().concat({ dx: 0, dy: 0, alpha: 1 });

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity: fade }, mode === 'screen' && s.screen]}
      testID="ghost-v0"
    >
      {layers.map((c, i) => (
        <Image
          key={i}
          source={source}
          resizeMode="stretch"
          fadeDuration={0}
          style={{
            position: 'absolute',
            left: x + c.dx,
            top: y + c.dy,
            width: w,
            height: h,
            opacity: opacity * c.alpha,
            tintColor: tint,
            transform: flip,
          }}
        />
      ))}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  // On the layer, not the images: on web every RN view is its own stacking context, so a blend
  // on an image would only mix with the empty layer. The layer itself blends with the photo.
  screen: { mixBlendMode: 'screen' },
});
