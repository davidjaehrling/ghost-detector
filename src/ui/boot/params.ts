// Optional query overrides for the web harness: ?static=1 renders the finished
// boot state with no timers, ?date=YYYY-MM-DD fixes tonight's date (at noon),
// &time=HH:MM sets the clock of a dated run (default 12:00), ?calib=1 opens on the belief-calibration card (golden),
// ?spike=1 (with static) shows the priming transient at its peak.
// Under ?static=1 without ?date= the clock is the harness time, so every screen reads the same
// activity index (the viewfinder reads the same params).

export type BootParams = { isStatic: boolean; date: Date; dated: boolean; calib: boolean; spike: boolean };

// The fixed clock of an undated static run: 2026-10-13 12:00 local.
export const harnessNow = () => new Date(2026, 9, 13, 12);

export function parseBootParams(search: string, now: Date = new Date()): BootParams {
  const q = new URLSearchParams(search);
  const isStatic = q.get('static') === '1';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(q.get('date') ?? '');
  const t = /^(\d{2}):(\d{2})$/.exec(q.get('time') ?? '');
  const hh = t && Number(t[1]) < 24 && Number(t[2]) < 60 ? { h: Number(t[1]), m: Number(t[2]) } : { h: 12, m: 0 };
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh.h, hh.m) : isStatic ? harnessNow() : now;
  return { isStatic, date, dated: m !== null, calib: q.get('calib') === '1', spike: isStatic && q.get('spike') === '1' };
}

export function readBootParams(): BootParams {
  const search = typeof window !== 'undefined' ? (window.location?.search ?? '') : '';
  return parseBootParams(search);
}
