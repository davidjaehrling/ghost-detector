import type { SkImage } from '@shopify/react-native-skia';

import { encodePng } from './render';

/** PNG bytes of the card (Skia's encoder). A web twin using the browser's encoder is planned (docs/perf-fx.md). */
export function encodeCard(image: SkImage): Promise<Uint8Array> {
  return Promise.resolve(encodePng(image));
}
