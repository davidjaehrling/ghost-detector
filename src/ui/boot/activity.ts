// Tonight's activity index (docs/psych-brief.md section 4): base 2, +1 within
// 2 days of a full moon, +1 from 22:00 to 04:00, +2 from 03:00 to 03:59.
// Moon phase is a simple synodic-month model, good to a day or so.

const SYNODIC_DAYS = 29.530588853;
const DAY_MS = 86_400_000;
// A known new moon: 2000-01-06 18:14 UTC.
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14);

export type Activity = { index: 1 | 2 | 3 | 4 | 5; moonPct: number };

// Moon age in days since new moon. Uses the local wall-clock fields so the
// result does not depend on the device time zone.
function moonAge(date: Date): number {
  const wall = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  );
  const days = (wall - NEW_MOON_REF) / DAY_MS;
  return ((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
}

export function activityIndex(date: Date): Activity {
  const age = moonAge(date);
  const phase = age / SYNODIC_DAYS;
  const moonPct = Math.round(((1 - Math.cos(2 * Math.PI * phase)) / 2) * 100);

  let score = 2;
  if (Math.abs(age - SYNODIC_DAYS / 2) <= 2) score += 1;
  const h = date.getHours();
  if (h === 3) score += 2;
  else if (h >= 22 || h < 4) score += 1;

  const index = Math.max(1, Math.min(5, score)) as Activity['index'];
  return { index, moonPct };
}

// Whole days from `date` until the next full moon (0 on the day itself).
export function daysToFullMoon(date: Date): number {
  const half = SYNODIC_DAYS / 2;
  const d = (((half - moonAge(date)) % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
  return Math.round(d);
}

// The peak hour of the activity index starts at 03:00 (psych brief section 4).
export const PEAK_HOUR = 3;

// Time until the next 03:00 on the local clock. Inside the 03:00 hour the window is open.
export function windowCountdown(date: Date): { open: boolean; hours: number; minutes: number } {
  const now = date.getHours() * 60 + date.getMinutes();
  if (date.getHours() === PEAK_HOUR) return { open: true, hours: 0, minutes: 0 };
  const left = (((PEAK_HOUR * 60 - now) % 1440) + 1440) % 1440;
  return { open: false, hours: Math.floor(left / 60), minutes: left % 60 };
}

export function formatWindowCountdown(date: Date): string {
  const c = windowCountdown(date);
  if (c.open) return '03:00 WINDOW OPEN';
  return c.hours > 0 ? `03:00 WINDOW IN ${c.hours} H ${c.minutes} MIN` : `03:00 WINDOW IN ${c.minutes} MIN`;
}

// Milliseconds until the wall clock next reaches a whole minute (the countdown's tick).
export function msToNextMinute(date: Date): number {
  return 60_000 - (date.getSeconds() * 1000 + date.getMilliseconds());
}
