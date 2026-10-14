import { describe, expect, it } from 'vitest';
import { LOCATION_TAGS } from '../../../state/locations';
import { TAG_GAP_MIN, tagLegend, tagRowGap } from '../lore';

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
