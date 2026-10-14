import type { Tier } from '../engine';
import type { KeyValueStore, ScanRecord } from './scans';
import { platformStorage } from './storage';

// Investigation log (docs/p6-brief.md section 3). Pure grouping over the scan records, plus the
// cumulative night counter. Nothing here resets, expires or counts days: no streaks.

export const UNTAGGED = 'untagged';

export type TagGroup = {
  tag: string;
  /** Cases newest first. */
  cases: ScanRecord[];
  count: number;
  /** Highest SPI in the group; ties go to the later case (as bestSoFar does). */
  peak: ScanRecord;
};

/** Groups by tag. Groups are ordered by their newest case, newest first. */
export function groupByTag(records: readonly ScanRecord[]): TagGroup[] {
  const by = new Map<string, ScanRecord[]>();
  for (const r of records) {
    const tag = r.tag && r.tag.length > 0 ? r.tag : UNTAGGED;
    const list = by.get(tag);
    if (list) list.push(r);
    else by.set(tag, [r]);
  }
  const groups: TagGroup[] = [];
  for (const [tag, list] of by) {
    const cases = [...list].sort((a, b) => b.createdAt - a.createdAt || Number(b.id) - Number(a.id));
    let peak = cases[0]!;
    for (const r of cases) if (r.outcome.spi > peak.outcome.spi) peak = r;
    groups.push({ tag, cases, count: cases.length, peak });
  }
  return groups.sort((a, b) => b.cases[0]!.createdAt - a.cases[0]!.createdAt || a.tag.localeCompare(b.tag));
}

/** The peak of every case on file, or null for an empty log. */
export function bestOnFile(records: readonly ScanRecord[]): ScanRecord | null {
  let best: ScanRecord | null = null;
  for (const r of records) if (!best || r.outcome.spi >= best.outcome.spi) best = r;
  return best;
}

const UNRESOLVED_TIERS: readonly Tier[] = ['active', 'strong', 'critical'];

/** Percent of the signature decoded while a Deep Scan has not run on a case that offers one; else null. */
export function unresolvedPct(r: ScanRecord): number | null {
  if (r.deepScanAt !== undefined) return null;
  return UNRESOLVED_TIERS.includes(r.outcome.tier) ? r.profile.signatureDecodedPct : null;
}

const NIGHT_CUT_HOURS = 6;

/** The local night a time belongs to: a scan before 06:00 counts for the evening before. "YYYY-MM-DD". */
export function nightKey(ms: number): string {
  const d = new Date(ms - NIGHT_CUT_HOURS * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** `2026-10-13 23:41`, local time, 24 h. */
export function stamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const KEY_NIGHTS = 'fs4.nights.v1';

/**
 * The set of nights with a scan. Kept apart from the records (which are capped at 500) so the count
 * only rises. `count(records)` also folds in records not yet recorded, e.g. seeded demo data.
 */
export function createNightsStore(storage: KeyValueStore | null = platformStorage()) {
  let nights: Set<string> | null = null;
  const load = () => {
    if (nights) return nights;
    nights = new Set();
    try {
      const raw: unknown = JSON.parse(storage?.getItem(KEY_NIGHTS) ?? '[]');
      if (Array.isArray(raw)) for (const n of raw) if (typeof n === 'string') nights.add(n);
    } catch {
      // memory only
    }
    return nights;
  };
  const save = () => {
    try {
      storage?.setItem(KEY_NIGHTS, JSON.stringify([...load()].sort()));
    } catch {
      // memory only
    }
  };
  return {
    record(ms: number) {
      const n = load();
      const k = nightKey(ms);
      if (!n.has(k)) {
        n.add(k);
        save();
      }
    },
    count(records: readonly ScanRecord[] = []): number {
      const all = new Set(load());
      for (const r of records) all.add(nightKey(r.createdAt));
      return all.size;
    },
  };
}

export type NightsStore = ReturnType<typeof createNightsStore>;

export const tagLabel = (tag: string) => tag.toUpperCase();
export const casesLabel = (n: number) => `${n} ${n === 1 ? 'CASE' : 'CASES'}`;

/** `CELLAR · 7 CASES · PEAK 84 STRONG · 2026-10-13 23:41` (brief section 3.1). */
export function recordLine(tag: string, count: number, peak: ScanRecord): string {
  return `${tagLabel(tag)} · ${casesLabel(count)} · PEAK ${peak.outcome.spi} ${peak.outcome.tier.toUpperCase()} · ${stamp(peak.createdAt)}`;
}
