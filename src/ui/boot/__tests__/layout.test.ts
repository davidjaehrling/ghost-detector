import { describe, expect, it } from 'vitest';
import { BOOT_ROWS_MAX, BOOT_ROWS_MIN, CARD_BOTTOM, GRID_TOP, READOUT_GAP, READOUT_H_CALIB, bootRows } from '../layout';

describe('boot graticule rows', () => {
  it('takes whole divisions up to what the blocks below leave', () => {
    // 390 wide: div 34, glass about 675 high, sticker 120 high.
    expect(bootRows({ h: 675, div: 34, calibrating: false, pinnedH: 120 })).toBeGreaterThanOrEqual(8);
  });

  it('calibration: the question block is pinned above the keys and the graticule takes the rest above it', () => {
    const rows = bootRows({ h: 675, div: 34, calibrating: true, pinnedH: 167 });
    expect(rows).toBeGreaterThan(4);
    // The grid, the readout and the block fit the glass without overlap, and less than a division is left over.
    const used = GRID_TOP + rows * 34 + READOUT_GAP + READOUT_H_CALIB + 167 + CARD_BOTTOM;
    expect(used).toBeLessThanOrEqual(675);
    expect(675 - used).toBeLessThan(34 + 8);
  });

  it('stays within 7 and 14 rows (the sticker stage)', () => {
    expect(bootRows({ h: 300, div: 34, calibrating: false, pinnedH: 200 })).toBe(BOOT_ROWS_MIN);
    expect(bootRows({ h: 2000, div: 34, calibrating: false, pinnedH: 100 })).toBe(BOOT_ROWS_MAX);
  });

  it('never leaves a band of a division or more empty (above the block gap)', () => {
    for (const h of [600, 631, 675, 720, 760]) {
      for (const calibrating of [false]) {
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
