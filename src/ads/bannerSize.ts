// Fixed height of the history banner slot (P5-06). The slot is sized before any request, so the
// layout never moves when the ad loads. Anchored adaptive banners are the full device width and
// a height Google derives from that width (50 dp at the least, about width / 6.4 on phones, capped
// at 15% of the screen height). The SDK reports the real size in onSizeChange; the dev build logs
// a mismatch so this estimate can be corrected on a phone (phone check 3).

export const ADAPTIVE_MIN_HEIGHT = 50;
export const ADAPTIVE_RATIO = 6.4;
export const ADAPTIVE_MAX_SHARE = 0.15;

/** Anchored adaptive height in dp for a device width (and optionally a screen height for the cap). */
export function anchoredAdaptiveHeight(width: number, screenHeight?: number): number {
  const h = Math.max(ADAPTIVE_MIN_HEIGHT, Math.round(width / ADAPTIVE_RATIO));
  return screenHeight ? Math.max(ADAPTIVE_MIN_HEIGHT, Math.min(h, Math.floor(screenHeight * ADAPTIVE_MAX_SHARE))) : h;
}

/** The slot with a bottom safe-area inset added. The history slot sits above the key row, so the screen passes 0. */
export function bannerSlotHeight(width: number, bottomInset: number, screenHeight?: number): number {
  return anchoredAdaptiveHeight(width, screenHeight) + Math.max(0, Math.round(bottomInset));
}

/** Least distance from the slot to the nearest row, key or control, above or below it, in dp (D-045). */
export const BANNER_GAP = 32;
