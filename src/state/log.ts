import { forecastIndex, isFullMoonWindow, NEW_MOON_REF_MS, SYNODIC_DAYS, type Tier } from '../engine';
import { CLASSES, PREFIXES } from '../engine/profileBank';
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

/** Row status: `UNRESOLVED 58%`, or `ARCHIVED 58%` once the user declined the rewarded ad; null when nothing is open. */
export function caseStatus(r: ScanRecord): string | null {
  const pct = unresolvedPct(r);
  if (pct === null) return null;
  return `${r.declined ? 'ARCHIVED' : 'UNRESOLVED'} ${pct}%`;
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

const KEY_MOONS = 'fs4.moons.v1';

/** The lunation a time falls in (counted from the reference new moon), or null outside a full-moon window. */
export function fullMoonId(ms: number): number | null {
  const off = offsetMin(ms);
  if (!isFullMoonWindow(ms, off)) return null;
  return Math.floor((ms + off * 60_000 - NEW_MOON_REF_MS) / 86_400_000 / SYNODIC_DAYS);
}

/**
 * The full moons with at least one case in their window. Same pattern as the nights store: kept
 * apart from the capped records so FULL MOONS LOGGED only rises. `count(records)` folds in records
 * not yet recorded (seeded demo data).
 */
export function createMoonsStore(storage: KeyValueStore | null = platformStorage()) {
  let moons: Set<number> | null = null;
  const load = () => {
    if (moons) return moons;
    moons = new Set();
    try {
      const raw: unknown = JSON.parse(storage?.getItem(KEY_MOONS) ?? '[]');
      if (Array.isArray(raw)) for (const n of raw) if (typeof n === 'number' && Number.isFinite(n)) moons.add(n);
    } catch {
      // memory only
    }
    return moons;
  };
  return {
    record(ms: number) {
      const id = fullMoonId(ms);
      const m = load();
      if (id === null || m.has(id)) return;
      m.add(id);
      try {
        storage?.setItem(KEY_MOONS, JSON.stringify([...m].sort((a, b) => a - b)));
      } catch {
        // memory only
      }
    },
    count(records: readonly ScanRecord[] = []): number {
      const all = new Set(load());
      for (const r of records) {
        const id = fullMoonId(r.createdAt);
        if (id !== null) all.add(id);
      }
      return all.size;
    },
  };
}

export type MoonsStore = ReturnType<typeof createMoonsStore>;

export const tagLabel = (tag: string) => tag.toUpperCase();
export const casesLabel = (n: number) => `${n} ${n === 1 ? 'CASE' : 'CASES'}`;

/** `CELLAR · 7 CASES · PEAK 84 STRONG · 2026-10-13 23:41` (brief section 3.1). */
export function recordLine(tag: string, count: number, peak: ScanRecord): string {
  return `${tagLabel(tag)} · ${casesLabel(count)} · PEAK ${peak.outcome.spi} ${peak.outcome.tier.toUpperCase()} · ${stamp(peak.createdAt)}`;
}

/** `22:48`, local time, 24 h. */
export function clock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export type CatalogueRow = {
  cls: string;
  prefix: string;
  /** The newest Deep Scan case of this class, or null while it is unlogged. */
  last: ScanRecord | null;
};

export type Catalogue = {
  rows: CatalogueRow[];
  /** Classes logged by a Deep Scan. Only rises. */
  count: number;
  /** Total classes in the profile bank (24). */
  total: number;
  /** Class of the newest Deep Scan, title case for the notification line; undefined while none is logged. */
  lastLoggedClass: string | undefined;
};

const titleCase = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

/** One row per entity class in the profile bank. A class is logged once a Deep Scan has run on a case of it. */
export function catalogue(records: readonly ScanRecord[]): Catalogue {
  const lastBy = new Map<string, ScanRecord>();
  let newest: ScanRecord | null = null;
  for (const r of records) {
    if (r.deepScanAt === undefined) continue;
    const cur = lastBy.get(r.profile.class);
    if (!cur || r.deepScanAt >= cur.deepScanAt!) lastBy.set(r.profile.class, r);
    if (!newest || r.deepScanAt >= newest.deepScanAt!) newest = r;
  }
  const rows = CLASSES.map((cls, i) => ({ cls: cls as string, prefix: PREFIXES[i] as string, last: lastBy.get(cls) ?? null }));
  return {
    rows,
    count: rows.filter((r) => r.last !== null).length,
    total: CLASSES.length,
    lastLoggedClass: newest ? titleCase(newest.profile.class) : undefined,
  };
}

const offsetMin = (ms: number) => -new Date(ms).getTimezoneOffset();

/** Full moons with at least one case in their window (within a day of full), counted once each, from the records alone. */
export function fullMoonsLogged(records: readonly ScanRecord[]): number {
  return createMoonsStore(null).count(records);
}

export type MoonNight = { date: string; moonPct: number; index: 1 | 2 | 3 | 4 | 5 };

const pad2 = (n: number) => String(n).padStart(2, '0');

function nightAt(nowMs: number, k: number): MoonNight {
  const now = new Date(nowMs);
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, 22, 0).getTime();
  const d = new Date(at);
  const f = forecastIndex(at, offsetMin(at));
  return { date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, moonPct: f.moonPct, index: f.index };
}

/** The next seven local nights, tonight first: `YYYY-MM-DD`, moon percentage and the forecast index at 22:00 local. */
export function moonTable(nowMs: number): MoonNight[] {
  return Array.from({ length: 7 }, (_, k) => nightAt(nowMs, k));
}

/** The first local night, tonight included, whose 22:00 falls in a full-moon window: `YYYY-MM-DD`. */
export function nextFullMoon(nowMs: number): string {
  for (let k = 0; k < 40; k++) {
    const now = new Date(nowMs);
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, 22, 0).getTime();
    if (isFullMoonWindow(at, offsetMin(at))) return nightAt(nowMs, k).date;
  }
  return nightAt(nowMs, 0).date;
}
