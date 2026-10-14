/** Web harness: `?session=N` makes the next session index N (L2 only). */
export function sessionParam(search: string): number | null {
  const v = new URLSearchParams(search).get('session');
  return v !== null && /^\d{1,4}$/.test(v) ? Number(v) : null;
}
