import { describe, expect, it } from 'vitest';
import { activityIndex, daysToFullMoon, formatWindowCountdown, msToNextMinute } from '../activity';
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
  it('reads time=HH:MM into the dated clock', () => {
    const p = parseBootParams('?static=1&date=2026-10-13&time=22:48');
    expect(p.date.getHours()).toBe(22);
    expect(p.date.getMinutes()).toBe(48);
    expect(parseBootParams('?date=2026-10-13&time=25:00').date.getHours()).toBe(12);
  });

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
    expect(parseBootParams('', now)).toEqual({ isStatic: false, date: now, dated: false, calib: false, spike: false });
  });
});

describe('static clock', () => {
  it('an undated static run reads the harness time, the same for every screen', () => {
    const p = parseBootParams('?static=1', new Date(2030, 5, 1, 3, 0));
    expect(p.date).toEqual(new Date(2026, 9, 13, 12));
    expect(activityIndex(p.date).index).toBe(2);
    expect(parseBootParams('?static=1&date=2026-10-13&time=22:48').date.getHours()).toBe(22);
  });
});

describe('minute clock', () => {
  it('ticks on the minute boundary', () => {
    expect(msToNextMinute(new Date(2026, 9, 13, 22, 48, 0, 0))).toBe(60_000);
    expect(msToNextMinute(new Date(2026, 9, 13, 22, 48, 59, 500))).toBe(500);
    expect(msToNextMinute(new Date(2026, 9, 13, 22, 48, 30, 0))).toBe(30_000);
  });
});

describe('window countdown', () => {
  it('counts down to the next 03:00 on the local clock', () => {
    expect(formatWindowCountdown(new Date(2026, 9, 13, 22, 48))).toBe('03:00 WINDOW IN 4 H 12 MIN');
    expect(formatWindowCountdown(new Date(2026, 9, 13, 12, 0))).toBe('03:00 WINDOW IN 15 H 0 MIN');
    expect(formatWindowCountdown(new Date(2026, 9, 13, 2, 15))).toBe('03:00 WINDOW IN 45 MIN');
    expect(formatWindowCountdown(new Date(2026, 9, 13, 4, 0))).toBe('03:00 WINDOW IN 23 H 0 MIN');
    expect(formatWindowCountdown(new Date(2026, 9, 13, 3, 30))).toBe('03:00 WINDOW OPEN');
  });
});
