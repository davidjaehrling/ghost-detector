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
