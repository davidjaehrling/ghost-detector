import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../../i18n';
import { LOCATION_TAGS } from '../../../state/locations';
import { TAG_GAP_MIN, longLegendsFit, tagLegend, tagRowGap } from '../lore';

describe('tag row', () => {
  it.each([360, 375, 379, 380, 390, 412, 428])('keeps at least 12 px between hit areas at %i', (w) => {
    expect(tagRowGap(LOCATION_TAGS, w)).toBeGreaterThanOrEqual(TAG_GAP_MIN);
  });
  it('uses short legends under 380 px only', () => {
    expect(tagLegend('hallway', 379)).toBe('HALL');
    expect(tagLegend('outdoors', 360)).toBe('OUTSIDE');
    expect(tagLegend('hallway', 380)).toBe('HALLWAY');
    expect(tagLegend('cellar', 360)).toBe('CELLAR');
  });
});

describe('tag row in the longer languages', () => {
  afterEach(() => setLanguage('system'));
  it.each(['de', 'es', 'pt'] as const)('%s keeps 12 px between hit areas at every width', (lang) => {
    setLanguage(lang);
    for (const w of [360, 375, 380, 390, 412, 428]) expect(tagRowGap(LOCATION_TAGS, w), `${lang} ${w}`).toBeGreaterThanOrEqual(TAG_GAP_MIN);
  });
  it('de falls back to the short legends where DACHBODEN and SCHLAFZIMMER would crowd the row', () => {
    setLanguage('de');
    expect(tagLegend('attic', 390)).toBe('DACH');
    expect(tagLegend('bedroom', 428)).toBe(longLegendsFit(428) ? 'SCHLAFZIMMER' : 'SCHLAFZ.');
  });
  it('en keeps its long legends from 380 px', () => {
    setLanguage('en');
    for (const w of [380, 390, 412, 428]) expect(longLegendsFit(w)).toBe(true);
  });
});
