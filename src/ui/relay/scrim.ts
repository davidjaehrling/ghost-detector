import { stripScrimAlpha } from '../result/stripScrim';
import { color } from '../tokens';

/** The viewfinder's dim layer over the feed (rgba n0 at this alpha). */
export const FEED_DIM = 0.22;
/** Brightest feed under the band: a white photo seen through the dim layer. */
export const RELAY_GROUND: readonly number[] = [255, 255, 255].map((v, i) => Math.round(v * (1 - FEED_DIM) + [10, 15, 11][i]! * FEED_DIM));
/** The band's n0 fill alpha: the strip scrim function (p3 text over the brightest feed, with grain), no more. */
export const RELAY_SCRIM = stripScrimAlpha(color.p3, RELAY_GROUND);
