import type { LocationTag } from '../../state/locations';

// Two-line field-manual notes, one per tag for now (docs/psych-brief.md
// section 2.1 wants six per tag per locale; Copy adds the rest to the locale
// files and this table becomes the EN fallback). Each line fits the HUD in one row.
export const LORE: Record<LocationTag, readonly [string, string]> = {
  cellar: ['Cellars hold cold air.', 'Readings below grade run 12% high.'],
  attic: ['Attic timber settles after dusk.', 'Flux spikes cluster near the roofline.'],
  bedroom: ['Night reports peak 02:00 to 04:00.', 'Sweep slowly. Hold at 30 cm.'],
  hallway: ['Corridors funnel cold air.', 'Doorways read 8% above baseline.'],
  outdoors: ['Open ground reads low.', 'Log any flux above 650 mG.'],
};

export const TAG_LABEL: Record<LocationTag, string> = {
  cellar: 'CELLAR',
  attic: 'ATTIC',
  bedroom: 'BEDROOM',
  hallway: 'HALLWAY',
  outdoors: 'OUTDOORS',
};

// Harness photos map to the tag they were shot for.
export const FIXTURE_TAG = { cellar: 'cellar', attic: 'attic', bright: 'hallway', black: 'cellar', outdoors: 'outdoors' } as const satisfies Record<string, LocationTag>;

// Under this window width the long legends switch to their short forms so the tag
// row keeps 12 px between its 44 dp hit areas.
export const TAG_SHORT_BELOW = 380;
const TAG_SHORT: Partial<Record<LocationTag, string>> = { hallway: 'HALL', outdoors: 'OUTSIDE' };

export function tagLegend(tag: LocationTag, windowW: number): string {
  return windowW < TAG_SHORT_BELOW ? (TAG_SHORT[tag] ?? TAG_LABEL[tag]) : TAG_LABEL[tag];
}

export const TAG_CH = 7; // B612 Mono 10 px: 6 px advance plus 1 px tracking
export const TAG_HIT = 44;
export const TAG_ROW_PAD = 4;
export const TAG_GAP_MIN = 12;
// The glass is the window minus the housing gutters (2 x 14), the LED plate (28), its margin (14) and the glass border.
export const glassWidth = (windowW: number) => windowW - 72;

// Smallest gap between neighbouring hit areas when the five tags are spread across the row.
export function tagRowGap(tags: readonly LocationTag[], windowW: number): number {
  const widths = tags.map((t) => Math.max(TAG_HIT, tagLegend(t, windowW).length * TAG_CH));
  const free = glassWidth(windowW) - TAG_ROW_PAD * 2 - widths.reduce((a, b) => a + b, 0);
  return free / (tags.length - 1);
}
