// Share card constants (P6-01, docs/p6-brief.md section 1).

/** Store name, filled at Gate 1. The only place the store name appears on the card (footer). */
export const STORE_NAME = '[STORE NAME]';

/** The housing's nameplate text (docs/instrument-bible.md section 2). No serial on the card. */
export const NAMEPLATE = 'VELDEN  FS-4/87-P';

/** The SIMULATED mark (Compliance launch blocker, D-026, D-032). */
export const SIMULATED = 'SIMULATED';

/** Footer text before the mark: `[STORE NAME] · READINGS ARE ` + SIMULATED. */
export const footerLead = (store: string = STORE_NAME) => `${store} · READINGS ARE `;

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
  /** Cap top of the footer line. */
  footerTop: number;
  /** Where the photo, the strip and its SIMULATED token must stay (story safe zone), or null. */
  safe: { top: number; bottom: number } | null;
}

/** Pixel positions from docs/p6-brief.md section 1.4. */
export const LAYOUTS: Record<CardFormat, CardLayout> = {
  story: {
    width: 1080,
    height: 1920,
    plate: { x: 40, y: 240, w: 1000, h: 60 },
    photo: { x: 40, y: 320, w: 1000, h: 1250 },
    reading: { x: 40, y: 1590, w: 1000, h: 110 },
    footerTop: 1720,
    safe: { top: 250, bottom: 1580 },
  },
  square: {
    width: 1080,
    height: 1080,
    plate: { x: 0, y: 0, w: 1080, h: 60 },
    photo: { x: 0, y: 60, w: 1080, h: 760 },
    reading: { x: 24, y: 840, w: 1032, h: 140 },
    footerTop: 1020,
    safe: null,
  },
};

/** The composite is laid out at half the card's photo size and drawn at 2x (the result screen's HIRES_SCALE). */
export const CARD_HIRES = 2;

/** Exported file name; it carries `simulated` (D-032). */
export const cardFileName = (caseId: string) => `field-card-${caseId}-simulated.png`;
