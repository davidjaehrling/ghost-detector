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

