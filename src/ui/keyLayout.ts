// Geometry of the fixed four-slot key row (D-007 item 1).

export const KEY_W = 72;
export const KEY_SLOTS = 4;
export const KEY_PLATE_PAD = 8;
/** Housing side padding; the key plate is the screen width minus twice this. */
export const KEY_GUTTER = 14;
/** Least distance from a cap to the screen edge. */
export const KEY_EDGE_MIN = 12;

// Gap and left margin snapped down to the 4 px grid for a given plate width.
export function keyLayout(plateW: number): { gap: number; left: number } {
  const free = plateW - KEY_SLOTS * KEY_W - KEY_PLATE_PAD * 2;
  const gap = Math.max(4, Math.min(32, Math.floor(free / (KEY_SLOTS - 1) / 4) * 4));
  const content = KEY_SLOTS * KEY_W + (KEY_SLOTS - 1) * gap;
  const left = Math.max(KEY_PLATE_PAD / 2, Math.floor((plateW - content) / 2 / 4) * 4);
  return { gap, left };
}


// A legend word must sit on one line inside the cap (72 wide, 2 padding, 1 border each side: 66 px).
// B612 Mono Bold 13 px advances 8.45 px (0.65 em) plus 0.6 tracking; a longer word (EINBAUEN, AUFNAHME) first
// gives up tracking, then size, so no word is ever broken across two lines.
const LEGEND_INNER = KEY_W - 6;
export function legendFit(legend: string): { fontSize: number; letterSpacing: number } | null {
  const longest = Math.max(1, ...legend.split(/\s+/).map((w) => [...w].length));
  const adv = (f: number) => f * 0.65;
  if (longest * (adv(13) + 0.6) <= LEGEND_INNER) return null;
  if (longest * (adv(13) + 0.2) <= LEGEND_INNER) return { fontSize: 13, letterSpacing: 0.2 };
  const fontSize = Math.max(9, Math.floor((LEGEND_INNER / longest - 0.2) / 0.65));
  return { fontSize, letterSpacing: 0.2 };
}

/** Banner slot bottom to the key band top. The caps start 38 px further down (32 px band, 6 px plate pad), so the slot is 62 dp clear of every key. */
export const SLOT_GAP_BELOW = 24;
/** Least distance from the banner slot to any key cap or list row, in dp. */
export const SLOT_CLEAR_MIN = 32;
