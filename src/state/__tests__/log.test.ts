import { describe, expect, it } from 'vitest';
import type { Outcome, Tier } from '../../engine';
import { bestOnFile, recordLine, createNightsStore, groupByTag, nightKey, stamp, unresolvedPct, UNTAGGED } from '../log';
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
