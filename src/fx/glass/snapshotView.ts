import { makeImageFromView, type SkImage } from '@shopify/react-native-skia';
import type { RefObject } from 'react';
import type { View } from 'react-native';

// Native: Skia reads the view's pixels by tag (the view needs collapsable={false}).
// The image is in device pixels.
export function snapshotView(ref: RefObject<View | null>): Promise<SkImage | null> {
  return makeImageFromView(ref as RefObject<View>);
}
