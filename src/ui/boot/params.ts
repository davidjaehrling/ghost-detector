// Optional query overrides for the web harness: ?static=1 renders the finished
// boot state with no timers, ?date=YYYY-MM-DD fixes tonight's date (at noon).

export type BootParams = { isStatic: boolean; date: Date; dated: boolean };

export function parseBootParams(search: string, now: Date = new Date()): BootParams {
  const q = new URLSearchParams(search);
  const isStatic = q.get('static') === '1';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(q.get('date') ?? '');
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0) : now;
  return { isStatic, date, dated: m !== null };
}

export function readBootParams(): BootParams {
  const search = typeof window !== 'undefined' ? (window.location?.search ?? '') : '';
  return parseBootParams(search);
}
