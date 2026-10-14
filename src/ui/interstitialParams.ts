/** Web harness: `?session=N` makes the next session index N (L2 only). */
export function sessionParam(search: string): number | null {
  const v = new URLSearchParams(search).get('session');
  return v !== null && /^\d{1,4}$/.test(v) ? Number(v) : null;
}

/**
 * Which viewfinder source may open the gate: a granted camera, or the web fixture (no camera there).
 * Denied, ask and loading (permission not yet known) keep it closed.
 */
export function gateOpenFor(source: 'loading' | 'camera' | 'ask' | 'fixture' | 'denied'): boolean {
  return source === 'camera' || source === 'fixture';
}
