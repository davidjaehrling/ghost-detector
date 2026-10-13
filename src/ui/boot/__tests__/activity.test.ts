import { describe, expect, it } from 'vitest';
import { activityIndex, daysToFullMoon } from '../activity';
import { parseBootParams } from '../params';

describe('activityIndex', () => {
  it('quiet noon near new moon: base 2, moon 5%', () => {
    expect(activityIndex(new Date(2026, 9, 13, 12, 0))).toEqual({ index: 2, moonPct: 5 });
  });

  it('full moon at 03:30: base 2 + 1 moon + 2 hour, clamped to 5, moon 100%', () => {
    expect(activityIndex(new Date(2026, 9, 26, 3, 30))).toEqual({ index: 5, moonPct: 100 });
  });

  it('late evening adds 1', () => {
    expect(activityIndex(new Date(2026, 9, 19, 23, 0)).index).toBe(3);
  });
});

describe('daysToFullMoon', () => {
  it('counts whole days to the next full moon', () => {
    expect(daysToFullMoon(new Date(2026, 9, 13, 12, 0))).toBe(13);
    expect(daysToFullMoon(new Date(2026, 9, 26, 3, 30))).toBe(0);
  });
});

describe('parseBootParams', () => {
  it('reads static and date', () => {
    const p = parseBootParams('?static=1&date=2026-10-13');
    expect(p.isStatic).toBe(true);
    expect(p.date.getFullYear()).toBe(2026);
    expect(p.date.getMonth()).toBe(9);
    expect(p.date.getDate()).toBe(13);
    expect(p.date.getHours()).toBe(12);
    expect(p.dated).toBe(true);
  });

  it('defaults to now and animated', () => {
    const now = new Date(2026, 0, 1);
    expect(parseBootParams('', now)).toEqual({ isStatic: false, date: now, dated: false });
  });
});
