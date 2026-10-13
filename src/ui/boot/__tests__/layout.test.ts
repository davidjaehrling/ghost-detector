import { describe, expect, it } from 'vitest';
import { BOOT_ROWS_MAX, BOOT_ROWS_MIN, bootRows } from '../layout';

describe('boot graticule rows', () => {
  it('takes whole divisions up to what the blocks below leave', () => {
    // 390 wide: div 34, glass about 675 high, sticker 120 high.
    expect(bootRows({ h: 675, div: 34, calibrating: false, pinnedH: 120 })).toBeGreaterThanOrEqual(8);
    expect(bootRows({ h: 675, div: 34, calibrating: true, pinnedH: 167 })).toBeGreaterThan(bootRows({ h: 675, div: 34, calibrating: false, pinnedH: 120 }));
  });

  it('stays within 7 and 12 rows', () => {
    expect(bootRows({ h: 300, div: 34, calibrating: false, pinnedH: 200 })).toBe(BOOT_ROWS_MIN);
    expect(bootRows({ h: 2000, div: 34, calibrating: true, pinnedH: 100 })).toBe(BOOT_ROWS_MAX);
  });

  it('never leaves a band of a division or more empty (above the block gap)', () => {
    for (const h of [600, 631, 675, 720, 760]) {
      for (const calibrating of [false, true]) {
        const div = 34;
        const rows = bootRows({ h, div, calibrating, pinnedH: calibrating ? 167 : 120 });
        if (rows > BOOT_ROWS_MIN && rows < BOOT_ROWS_MAX) {
          const next = bootRows({ h: h - 1, div, calibrating, pinnedH: calibrating ? 167 : 120 });
          expect(next).toBeLessThanOrEqual(rows);
        }
      }
    }
  });
});
