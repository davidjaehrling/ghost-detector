// Fault injection names and the query parser. Web harness only: `?fault=storage-write,skia`.
export const FAULTS = [
  'storage-read',
  'storage-write',
  'camera-denied',
  'camera-revoked',
  'skia',
  'ad-load',
  'consent-timeout',
  'share-cancel',
  'notify-denied',
  'locale-missing',
  'render',
] as const;

export type Fault = (typeof FAULTS)[number];

export function parseFaults(search: string): ReadonlySet<Fault> {
  const out = new Set<Fault>();
  const raw = new URLSearchParams(search).get('fault') ?? '';
  for (const name of raw.split(',')) if ((FAULTS as readonly string[]).includes(name)) out.add(name as Fault);
  return out;
}
