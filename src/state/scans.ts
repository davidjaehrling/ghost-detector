import type { EntityProfile, Intensity, Outcome, OutcomeHistory } from '../engine';

// In-memory scan store. Web mirrors it to localStorage (guarded); native has no
// persistence yet, so records live for the process. The engine reads history
// (docs: src/engine/README.md), so getHistory() derives it from the records.

export type ScanRecord = {
  /** Case number, zero padded: "0001". */
  id: string;
  createdAt: number;
  photoUri: string;
  /** Location tag chosen in the viewfinder, when there was one. */
  tag?: string;
  seed: number;
  outcome: Outcome;
  profile: EntityProfile;
};

export type KeyValueStore = { getItem(k: string): string | null; setItem(k: string, v: string): void };

export type ScanStore = {
  saveScan(record: Omit<ScanRecord, 'id'> | ScanRecord): string;
  getScan(id: string): ScanRecord | undefined;
  listScans(): ScanRecord[];
  getHistory(nowMs?: number): OutcomeHistory;
  getRecentNames(): string[];
  /** Trait lines of the last 20 records, newest last (no-repeat input for the profile generator). */
  getRecentLines(): string[];
  getIntensity(): Intensity;
  setIntensity(i: Intensity): void;
};

const KEY_SCANS = 'fs4.scans.v1';
const KEY_INTENSITY = 'fs4.intensity.v1';
const MAX_RECORDS = 500;
const DEFAULT_INTENSITY: Intensity = 'standard';
const INTENSITIES: readonly Intensity[] = ['calm', 'standard', 'brave'];
const DRY_TIERS = new Set(['quiet', 'trace', 'active']);

export function webStorage(): KeyValueStore | null {
  try {
    const ls = (globalThis as { localStorage?: KeyValueStore }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

export function createScanStore(opts: { storage?: KeyValueStore | null; sessionStartMs?: number } = {}): ScanStore {
  const storage = opts.storage === undefined ? webStorage() : opts.storage;
  const sessionStart = opts.sessionStartMs ?? Date.now();
  let records: ScanRecord[] | null = null;
  let intensity: Intensity | null = null;

  const load = (): ScanRecord[] => {
    if (records) return records;
    records = [];
    try {
      const raw = storage?.getItem(KEY_SCANS);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) records = parsed.filter(isRecord);
    } catch {
      records = [];
    }
    return records;
  };

  const persist = () => {
    try {
      storage?.setItem(KEY_SCANS, JSON.stringify(records ?? []));
    } catch {
      // quota or blocked storage: keep going in memory
    }
  };

  return {
    saveScan(record) {
      const all = load();
      const next = all.reduce((n, r) => Math.max(n, Number(r.id) || 0), 0) + 1;
      const id = String(next).padStart(4, '0');
      all.push({ ...record, id });
      if (all.length > MAX_RECORDS) all.splice(0, all.length - MAX_RECORDS);
      persist();
      return id;
    },
    getScan: (id) => load().find((r) => r.id === id),
    listScans: () => [...load()],
    getRecentNames: () => load().map((r) => r.profile.name).slice(-20),
    getRecentLines: () => load().slice(-20).flatMap((r) => r.profile.traits ?? []),
    getHistory(nowMs = Date.now()) {
      const all = load();
      let scansSinceCritical: number | null = null;
      for (let i = all.length - 1; i >= 0; i--) {
        if (all[i]!.outcome.tier === 'critical') {
          scansSinceCritical = all.length - i;
          break;
        }
      }
      let dryStreak = 0;
      for (let i = all.length - 1; i >= 0 && DRY_TIERS.has(all[i]!.outcome.tier); i--) dryStreak++;
      const scares = all.filter((r) => r.outcome.jumpScare);
      const last = scares.at(-1);
      return {
        scanCount: all.length,
        scansSinceCritical,
        dryStreak,
        nowMs,
        lastJumpScareMs: last ? last.createdAt : null,
        jumpScareThisSession: scares.some((r) => r.createdAt >= sessionStart),
      };
    },
    getIntensity() {
      if (intensity) return intensity;
      intensity = DEFAULT_INTENSITY;
      try {
        const raw = storage?.getItem(KEY_INTENSITY) as Intensity | null | undefined;
        if (raw && INTENSITIES.includes(raw)) intensity = raw;
      } catch {
        // keep the default
      }
      return intensity;
    },
    setIntensity(i) {
      intensity = i;
      try {
        storage?.setItem(KEY_INTENSITY, i);
      } catch {
        // memory only
      }
    },
  };
}

function isRecord(v: unknown): v is ScanRecord {
  const r = v as Partial<ScanRecord> | null;
  return (
    !!r &&
    typeof r.id === 'string' &&
    typeof r.createdAt === 'number' &&
    typeof r.photoUri === 'string' &&
    typeof r.seed === 'number' &&
    !!r.outcome &&
    !!r.profile
  );
}

const store = createScanStore();
export const saveScan = store.saveScan;
export const getScan = store.getScan;
export const listScans = store.listScans;
export const getHistory = store.getHistory;
export const getRecentNames = store.getRecentNames;
export const getRecentLines = store.getRecentLines;
export const getIntensity = store.getIntensity;
export const setIntensity = store.setIntensity;
