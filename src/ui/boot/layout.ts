/** Bible section 3: the grid starts 24 px under the glass edge. */
export const GRID_TOP = 24;

// Boot stacks its glass from the top: graticule, the readout block under it, then the sticker (first
// stage) or the calibration card (second stage) pinned to the bottom. The graticule takes whole
// divisions up to what is left, so no band of empty glass sits between the blocks (the scan
// theatre does the same). Seven rows is the floor, used only on a short glass (360 px wide).

export const BOOT_ROWS_MIN = 7;
export const BOOT_ROWS_MAX = 14;
/** Readout block starts this far under the grid (timebase label sits in between). */
export const READOUT_GAP = 28;
/** Least gap between the readout block and what is pinned below it. */
export const BLOCK_GAP = 8;
/** Self-test lines (3 x 20), SELFTEST OK (28), TRANSIENT (24), ACT IDX (32), countdown (24), next peak (24). */
export const READOUT_H_BOOT = 192;
/** ACT IDX (32) and the countdown (24) only: the calibration card replaces the rest. */
export const READOUT_H_CALIB = 56;
/** The pinned block's distance from the glass bottom. */
export const STICKER_BOTTOM = 13;
/** The -1.5 degree tilt lifts the sticker's right end by about this much above its layout box. */
export const STICKER_TILT = 9;
export const CARD_BOTTOM = 12;

export function bootRows({ h, div, calibrating, pinnedH }: { h: number; div: number; calibrating: boolean; pinnedH: number }): number {
  const readout = calibrating ? READOUT_H_CALIB : READOUT_H_BOOT;
  const pinned = pinnedH + (calibrating ? CARD_BOTTOM : STICKER_BOTTOM + STICKER_TILT);
  const rows = Math.floor((h - GRID_TOP - READOUT_GAP - readout - BLOCK_GAP - pinned) / div);
  return Math.max(BOOT_ROWS_MIN, Math.min(BOOT_ROWS_MAX, rows));
}
