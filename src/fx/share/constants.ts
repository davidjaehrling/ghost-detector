// Share card constants (P6-01, docs/p6-brief.md section 1).

/** Store name, filled at Gate 1. The only place the store name appears on the card (footer). */
export const STORE_NAME = '[STORE NAME]';

/** The housing's nameplate text (docs/instrument-bible.md section 2). No serial on the card. */
export const NAMEPLATE = 'VELDEN  FS-4/87-P';

// The SIMULATED mark (Compliance launch blocker, D-026, D-032) and the footer sentence are
// localised (D-038): `share.card.mark` and `share.card.footer` in locales/<lang>.json, read in
// text.ts. No English constant, so no locale can fall back to the English mark by accident.

/** Least cap height of the SIMULATED mark, as a share of the card height (acceptance P6-01). */
export const MARK_CAP_FRAC = 0.02;
/** The renderer sizes the mark this much above the floor, so antialiasing never lands it under. */
export const MARK_SAFETY = 1.1;
/** Contrast the strip's scrim is chosen for (worst pixel under it, worst grain sign); the floor is 4.5. */
export const MARK_CONTRAST_TARGET = 5;
/** The strip scrim never goes under the on-screen 40% n0 (D-022). */
export const STRIP_SCRIM_MIN = 0.4;

export type CardFormat = 'story' | 'square';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardLayout {
  width: number;
  height: number;
  plate: Box;
  photo: Box;
  reading: Box;
  /** Cap top of the footer's first line. */
  footerTop: number;
  /** Where the photo, the strip and its SIMULATED token must stay (story safe zone), or null. */
  safe: { top: number; bottom: number } | null;
}

/**
 * Pixel positions: docs/p6-brief.md section 1.4 as amended by D-034 (b). The story photo is 1240
 * tall (was 1250) and starts at 300 so the reading row (1558 to 1772) and the two-line footer at the
 * mark's size (1794 to 1899) both fit under it; the square nameplate is inset 24 px.
 */
export const LAYOUTS: Record<CardFormat, CardLayout> = {
  story: {
    width: 1080,
    height: 1920,
    plate: { x: 40, y: 228, w: 1000, h: 56 },
    photo: { x: 40, y: 300, w: 1000, h: 1240 },
    reading: { x: 40, y: 1558, w: 1000, h: 214 },
    footerTop: 1794,
    safe: { top: 250, bottom: 1580 },
  },
  square: {
    width: 1080,
    height: 1080,
    plate: { x: 64, y: 24, w: 952, h: 56 },
    photo: { x: 0, y: 96, w: 1080, h: 704 },
    reading: { x: 24, y: 816, w: 1032, h: 192 },
    footerTop: 1024,
    safe: null,
  },
};

/** The composite is laid out at half the card's photo size and drawn at 2x (the result screen's HIRES_SCALE). */
export const CARD_HIRES = 2;

/** Exported file name; it carries `simulated` (D-032). */
export const cardFileName = (caseId: string) => `field-card-${caseId}-simulated.png`;
