import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { ghostTint, type Placement } from './placement';

const MATTES: Record<Placement['matte'], ImageSourcePropType> = {
  1: require('../../../assets/ghost/matte-1.png'),
  2: require('../../../assets/ghost/matte-2.png'),
  3: require('../../../assets/ghost/matte-3.png'),
};

export interface GhostV0Props {
  /** From `placeGhost`, in the same pixel space as the parent view. */
  placement: Placement;
  /** Mean luma of the dark region, 0..255 (from `regionFromImage` or the engine). */
  regionMeanLuma: number;
}

/**
 * v0 compositor: plain RN images over the photo. Normal alpha blend, a neutral grey tint set
 * just above the region mean (the brightness clamp), and offset copies standing in for blur.
 * Render it as a sibling layered above the photo, inside a view of the photo's size.
 */
export function GhostV0({ placement, regionMeanLuma }: GhostV0Props) {
  const { x, y, w, h, matte, opacity, flipX, offsetCopies } = placement;
  const tint = ghostTint(regionMeanLuma, placement).hex;
  const source = MATTES[matte];
  const flip = flipX ? [{ scaleX: -1 }] : undefined;
  // Farthest copy first so the main figure lands on top.
  const layers = [...offsetCopies].reverse().concat({ dx: 0, dy: 0, alpha: 1 });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="ghost-v0">
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
    </View>
  );
}
