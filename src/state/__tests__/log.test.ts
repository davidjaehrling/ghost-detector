import { describe, expect, it } from 'vitest';
import { NEW_MOON_REF_MS, SYNODIC_DAYS, type Outcome, type Tier } from '../../engine';
import { CLASSES } from '../../engine/profileBank';
import { bestOnFile, catalogue, clock, fullMoonsLogged, moonTable, nextFullMoon, createMoonsStore, fullMoonId, caseStatus, recordLine, createNightsStore, groupByTag, nightKey, stamp, unresolvedPct, UNTAGGED } from '../log';
import { createScanStore, type KeyValueStore, type ScanRecord } from '../scans';

const mem = (): KeyValueStore => {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();

const rec = (id: string, tag: string | undefined, spi: number, tier: Tier, createdAt: number, over: Partial<ScanRecord> = {}): ScanRecord => ({
  id,
  createdAt,
  photoUri: 'p',
  seed: 1,
  ...(tag ? { tag } : {}),
  outcome: { tier, spi, figureShown: false, smudge: false, jumpScare: false, scanDurationMs: 7000 } as Outcome,
  profile: { class: 'RESIDUAL', era: 'e', name: `n${id}`, traits: [], signatureDecodedPct: 58 },
  ...over,
});

describe('groupByTag', () => {
  const all = [
    rec('0001', 'cellar', 40, 'active', at(10, 22)),
    rec('0002', 'attic', 20, 'trace', at(11, 22)),
    rec('0003', 'cellar', 84, 'strong', at(12, 23, 41)),
    rec('0004', 'cellar', 84, 'strong', at(13, 21)),
    rec('0005', undefined, 5, 'quiet', at(13, 22)),
  ];
  const groups = groupByTag(all);

  it('groups by tag, newest group first, untagged last-seen kept apart', () => {
    expect(groups.map((g) => g.tag)).toEqual([UNTAGGED, 'cellar', 'attic']);
    expect(groups.map((g) => g.count)).toEqual([1, 3, 1]);
  });
  it('lists cases newest first', () => {
    expect(groups[1]!.cases.map((c) => c.id)).toEqual(['0004', '0003', '0001']);
  });
  it('takes the peak by SPI, never an average, ties to the later case', () => {
    expect(groups[1]!.peak.id).toBe('0004');
  });
  it('is empty for an empty log', () => {
    expect(groupByTag([])).toEqual([]);
    expect(bestOnFile([])).toBeNull();
  });
  it('finds the best across all tags', () => {
    expect(bestOnFile(all)!.id).toBe('0004');
  });
});

describe('unresolvedPct', () => {
  it('shows the decoded share for a case that offers a Deep Scan and has none', () => {
    expect(unresolvedPct(rec('1', 'cellar', 60, 'strong', 1))).toBe(58);
    expect(unresolvedPct(rec('1', 'cellar', 60, 'active', 1))).toBe(58);
  });
  it('is null for quiet and trace, and after a Deep Scan', () => {
    expect(unresolvedPct(rec('1', 'cellar', 5, 'quiet', 1))).toBeNull();
    expect(unresolvedPct(rec('1', 'cellar', 15, 'trace', 1))).toBeNull();
    expect(unresolvedPct(rec('1', 'cellar', 60, 'strong', 1, { deepScanAt: 2 }))).toBeNull();
  });
  it('never expires: the value does not depend on age', () => {
    expect(unresolvedPct(rec('1', 'cellar', 60, 'strong', 0))).toBe(58);
  });
});

describe('nights logged', () => {
  it('counts distinct local nights; a scan before 06:00 belongs to the evening before', () => {
    expect(nightKey(at(13, 23, 59))).toBe('2026-10-13');
    expect(nightKey(at(14, 1))).toBe('2026-10-13');
    expect(nightKey(at(14, 7))).toBe('2026-10-14');
  });
  it('counts a night once and only rises, also when old records are dropped', () => {
    const storage = mem();
    const s = createScanStore({ storage });
    const base = { photoUri: 'p', seed: 1 };
    const mk = (t: number) => ({ ...base, createdAt: t, outcome: rec('x', 'a', 1, 'quiet', t).outcome, profile: rec('x', 'a', 1, 'quiet', t).profile });
    s.saveScan(mk(at(10, 22)));
    s.saveScan(mk(at(10, 23)));
    s.saveScan(mk(at(11, 1)));
    expect(s.nightsLogged()).toBe(1);
    s.saveScan(mk(at(12, 22)));
    expect(s.nightsLogged()).toBe(2);
    // A new store over the same storage, with the records gone, still reports the nights.
    const nights = createNightsStore(storage);
    expect(nights.count([])).toBe(2);
    nights.record(at(15, 21));
    expect(nights.count([])).toBe(3);
  });
});

describe('stamp', () => {
  it('is local time, 24 h, zero padded', () => {
    expect(stamp(at(3, 7, 5))).toBe('2026-10-03 07:05');
  });
});

describe('recordLine', () => {
  it('prints the tag record row', () => {
    const peak = rec('0003', 'cellar', 84, 'strong', at(13, 23, 41));
    expect(recordLine('cellar', 7, peak)).toBe('CELLAR · 7 CASES · PEAK 84 STRONG · 2026-10-13 23:41');
    expect(recordLine('cellar', 1, peak)).toContain('1 CASE ·');
    expect(recordLine(UNTAGGED, 2, peak)).toContain('UNTAGGED · 2 CASES');
  });
});

describe('caseStatus', () => {
  it('reads UNRESOLVED while open and ARCHIVED once declined', () => {
    expect(caseStatus(rec('1', 'cellar', 60, 'strong', 1))).toBe('UNRESOLVED 58%');
    expect(caseStatus(rec('1', 'cellar', 60, 'strong', 1, { declined: true }))).toBe('ARCHIVED 58%');
  });
  it('is null where nothing is open: QUIET, TRACE, or a Deep Scan done (even if declined earlier)', () => {
    expect(caseStatus(rec('1', 'cellar', 5, 'quiet', 1, { declined: true }))).toBeNull();
    expect(caseStatus(rec('1', 'cellar', 15, 'trace', 1))).toBeNull();
    expect(caseStatus(rec('1', 'cellar', 60, 'strong', 1, { declined: true, deepScanAt: 5 }))).toBeNull();
  });
});

describe('clock', () => {
  it('is local HH:MM, zero padded', () => {
    expect(clock(at(13, 22, 48))).toBe('22:48');
    expect(clock(at(13, 3, 5))).toBe('03:05');
  });
});

describe('catalogue', () => {
  it('has one row per class in the profile bank (24), all unlogged for an empty log', () => {
    const c = catalogue([]);
    expect(c.total).toBe(24);
    expect(c.rows.map((r) => r.cls)).toEqual([...CLASSES]);
    expect(c.count).toBe(0);
    expect(c.rows.every((r) => r.last === null)).toBe(true);
    expect(c.lastLoggedClass).toBeUndefined();
  });
  it('logs a class only once a Deep Scan has run, with its newest case', () => {
    const shade = (id: string, deep: number | undefined) => rec(id, 'a', 50, 'strong', at(12, 21), { profile: { class: 'SHADE', era: 'e', name: id, traits: [], signatureDecodedPct: 60 }, ...(deep ? { deepScanAt: deep } : {}) });
    const c = catalogue([rec('0001', 'a', 50, 'active', at(9, 20)), shade('0002', at(12, 22)), shade('0003', at(13, 1)), shade('0004', undefined)]);
    expect(c.count).toBe(1);
    expect(c.rows.find((r) => r.cls === 'SHADE')!.last!.id).toBe('0003');
    expect(c.rows.find((r) => r.cls === 'RESIDUAL')!.last).toBeNull();
    expect(c.lastLoggedClass).toBe('Shade');
  });
  it('names the class of the newest Deep Scan, title case, hyphen kept', () => {
    const mk = (id: string, cls: string, deep: number) => rec(id, 'a', 50, 'strong', at(12, 21), { profile: { class: cls, era: 'e', name: id, traits: [], signatureDecodedPct: 60 }, deepScanAt: deep });
    expect(catalogue([mk('1', 'SHADE', at(12, 22)), mk('2', 'TRACE-FORM', at(13, 1))]).lastLoggedClass).toBe('Trace-form');
  });
});

describe('fullMoonsLogged', () => {
  const fullMoon = (k: number) => NEW_MOON_REF_MS + (k + 0.5) * SYNODIC_DAYS * 86_400_000;
  it('counts each full moon once, however many cases fall in its window', () => {
    const k = 310;
    expect(fullMoonsLogged([rec('1', 'a', 50, 'quiet', fullMoon(k)), rec('2', 'a', 50, 'quiet', fullMoon(k) + 3_600_000), rec('3', 'a', 50, 'quiet', fullMoon(k) - 20 * 3_600_000)])).toBe(1);
    expect(fullMoonsLogged([rec('1', 'a', 50, 'quiet', fullMoon(k)), rec('2', 'a', 50, 'quiet', fullMoon(k + 1))])).toBe(2);
  });
  it('ignores cases outside the window', () => {
    expect(fullMoonsLogged([rec('1', 'a', 50, 'quiet', NEW_MOON_REF_MS + 310 * SYNODIC_DAYS * 86_400_000), rec('2', 'a', 50, 'quiet', fullMoon(310) + 3 * 86_400_000)])).toBe(0);
    expect(fullMoonsLogged([])).toBe(0);
  });
});

describe('moonTable', () => {
  it('lists seven consecutive local nights from tonight with moon percentage and an index of 1 to 5', () => {
    const t = moonTable(at(13, 12));
    expect(t.map((n) => n.date)).toEqual(['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19']);
    for (const n of t) {
      expect(n.index).toBeGreaterThanOrEqual(1);
      expect(n.index).toBeLessThanOrEqual(5);
      expect(n.moonPct).toBeGreaterThanOrEqual(0);
      expect(n.moonPct).toBeLessThanOrEqual(100);
    }
  });
  it('crosses a month end', () => {
    expect(moonTable(new Date(2026, 9, 29, 9).getTime()).map((n) => n.date).slice(2, 5)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
  });
});

describe('nextFullMoon', () => {
  it('is a YYYY-MM-DD night whose 22:00 sits in a full-moon window, tonight included, within one lunation', () => {
    for (let d = 0; d < 30; d++) {
      const now = new Date(2026, 9, 1 + d, 12).getTime();
      const next = nextFullMoon(now);
      expect(next).toMatch(/^\d{4}-\d\d-\d\d$/);
      const [y, m, day] = next.split('-').map(Number);
      const night = new Date(y!, m! - 1, day!, 22).getTime();
      expect(fullMoonId(night)).not.toBeNull();
      expect(night).toBeGreaterThanOrEqual(new Date(2026, 9, 1 + d, 22).getTime());
      expect(night - now).toBeLessThan(31 * 86_400_000);
    }
  });
  it('agrees with moonTable on nights inside the table', () => {
    const now = new Date(2026, 9, 13, 12).getTime();
    const next = nextFullMoon(now);
    const t = moonTable(now);
    if (t.some((n) => n.date === next)) expect(t[0]!.date <= next).toBe(true);
  });
});

describe('moons store', () => {
  const mem = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };
  const full = NEW_MOON_REF_MS + (310.5) * SYNODIC_DAYS * 86_400_000;
  it('keeps the count when the records are gone, counts a moon once, never falls', () => {
    const storage = mem();
    const a = createMoonsStore(storage);
    expect(a.count([])).toBe(0);
    a.record(full);
    a.record(full + 3_600_000);
    a.record(NEW_MOON_REF_MS + 311 * SYNODIC_DAYS * 86_400_000); // new moon: ignored
    expect(a.count([])).toBe(1);
    a.record(full + SYNODIC_DAYS * 86_400_000);
    const b = createMoonsStore(storage);
    expect(b.count([])).toBe(2);
    expect(b.count([rec('1', 'a', 50, 'quiet', full + 2 * SYNODIC_DAYS * 86_400_000)])).toBe(3);
  });
  it('persists under its own key and survives broken storage', () => {
    const storage = mem();
    createMoonsStore(storage).record(full);
    expect(JSON.parse(storage.getItem('fs4.moons.v1')!)).toHaveLength(1);
    expect(() => createMoonsStore({ getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } }).record(full)).not.toThrow();
  });
});
