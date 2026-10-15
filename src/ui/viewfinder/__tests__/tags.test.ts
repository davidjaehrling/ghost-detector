import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../../i18n';
import { LOCATION_TAGS } from '../../../state/locations';
import { TAG_GAP_MIN, tagLegend, tagRowGap } from '../lore';

describe('tag row', () => {
  it.each([360, 375, 379, 380, 390, 412, 428])('keeps at least 12 px between hit areas at %i', (w) => {
    expect(tagRowGap(LOCATION_TAGS, w)).toBeGreaterThanOrEqual(TAG_GAP_MIN);
  });
  it('always uses the short legends', () => {
    expect(tagLegend('hallway')).toBe('HALL');
    expect(tagLegend('outdoors')).toBe('OUTSIDE');
    expect(tagLegend('cellar')).toBe('CELLAR');
  });
});

describe('tag row in the longer languages', () => {
  afterEach(() => setLanguage('system'));
  it.each(['de', 'es', 'pt'] as const)('%s keeps 12 px between hit areas at every width', (lang) => {
    setLanguage(lang);
    for (const w of [360, 375, 380, 390, 412, 428]) expect(tagRowGap(LOCATION_TAGS, w), `${lang} ${w}`).toBeGreaterThanOrEqual(TAG_GAP_MIN);
  });
  it('de uses the short legends where DACHBODEN and SCHLAFZIMMER would crowd the row', () => {
    setLanguage('de');
    expect(tagLegend('attic')).toBe('DACH');
    expect(tagLegend('bedroom')).toBe('SCHLAFZ.');
  });
});
