import { copyOf, t } from '../../i18n';
import type { LocationTag } from '../../state/locations';

// Two-line field-manual notes, one per tag for now (docs/psych-brief.md
// section 2.1 wants six per tag per locale; Copy adds the rest to the locale
// files and this table becomes the EN fallback). Each line fits the HUD in one row.
export const LORE: Record<LocationTag, readonly [string, string]> = {
  get cellar() {
    return [t('lore.cellar.0'), t('lore.cellar.1')] as const;
  },
  get attic() {
    return [t('lore.attic.0'), t('lore.attic.1')] as const;
  },
  get bedroom() {
    return [t('lore.bedroom.0'), t('lore.bedroom.1')] as const;
  },
  get hallway() {
    return [t('lore.hallway.0'), t('lore.hallway.1')] as const;
  },
  get outdoors() {
    return [t('lore.outdoors.0'), t('lore.outdoors.1')] as const;
  },
};

export const TAG_LABEL: Record<LocationTag, string> = copyOf({
  cellar: 'tag.cellar',
  attic: 'tag.attic',
  bedroom: 'tag.bedroom',
  hallway: 'tag.hallway',
  outdoors: 'tag.outdoors',
});

// Harness photos map to the tag they were shot for.
export const FIXTURE_TAG = { cellar: 'cellar', attic: 'attic', bright: 'hallway', black: 'cellar', outdoors: 'outdoors' } as const satisfies Record<string, LocationTag>;

// Under this window width the long legends switch to their short forms so the tag
// row keeps 12 px between its 44 dp hit areas.
export const TAG_SHORT_BELOW = 380;
const TAG_SHORT: Record<LocationTag, string> = copyOf({
  cellar: 'tag.short.cellar',
  attic: 'tag.short.attic',
  bedroom: 'tag.short.bedroom',
  hallway: 'tag.short.hallway',
  outdoors: 'tag.short.outdoors',
});

const ALL_TAGS = Object.keys(TAG_LABEL) as LocationTag[];

// The long legends are used from TAG_SHORT_BELOW up, and only while they still leave 12 px between
// the hit areas: a language with longer words (DACHBODEN, DORMITORIO) falls back to its short forms.
export function longLegendsFit(windowW: number): boolean {
  if (windowW < TAG_SHORT_BELOW) return false;
  const widths = ALL_TAGS.map((tg) => Math.max(TAG_HIT, TAG_LABEL[tg].length * tagChWidth(windowW)));
  const free = glassWidth(windowW) - TAG_ROW_PAD * 2 - widths.reduce((a, b) => a + b, 0);
  return free / (ALL_TAGS.length - 1) >= TAG_GAP_MIN;
}

export function tagLegend(tag: LocationTag, windowW: number): string {
  return longLegendsFit(windowW) ? TAG_LABEL[tag] : TAG_SHORT[tag];
}

// B612 Mono 10 px advances 6.5 px; with 1 px tracking that is 7.5 px per character (measured). Under
// TAG_TIGHT_BELOW the tracking drops to 0.4 px so five legends, OUTSIDE among them, keep 12 px gaps
// (a 380 px window with full legends and wide tracking would leave 11.5).
export const TAG_CH = 7.5;
export const TAG_TRACK = 1.0;
export const TAG_TRACK_NARROW = 0.4;
export const TAG_TIGHT_BELOW = 385;
export const tagTracking = (windowW: number) => (windowW < TAG_TIGHT_BELOW ? TAG_TRACK_NARROW : TAG_TRACK);
export const tagChWidth = (windowW: number) => TAG_CH - TAG_TRACK + tagTracking(windowW);
export const TAG_HIT = 44;
export const TAG_ROW_PAD = 4;
export const TAG_GAP_MIN = 12;
// The glass is the window minus the housing gutters (2 x 14), the LED plate (28), its margin (14) and the glass border.
export const glassWidth = (windowW: number) => windowW - 72;

// Smallest gap between neighbouring hit areas when the five tags are spread across the row.
export function tagRowGap(tags: readonly LocationTag[], windowW: number): number {
  const widths = tags.map((tg) => Math.max(TAG_HIT, tagLegend(tg, windowW).length * tagChWidth(windowW)));
  const free = glassWidth(windowW) - TAG_ROW_PAD * 2 - widths.reduce((a, b) => a + b, 0);
  return free / (tags.length - 1);
}
