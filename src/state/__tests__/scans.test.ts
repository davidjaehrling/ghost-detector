import { describe, expect, it } from 'vitest';
import { drawOutcome, generateProfile, type Outcome, type Tier } from '../../engine';
import { createScanStore, type KeyValueStore, type ScanRecord } from '../scans';

const mem = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

const rec = (tier: Tier, createdAt: number, over: Partial<Outcome> = {}, name = `RSD-${createdAt}-A`): Omit<ScanRecord, 'id'> => ({
  createdAt,
  photoUri: 'p',
  seed: createdAt,
  outcome: { tier, spi: 50, figureShown: false, smudge: false, jumpScare: false, scanDurationMs: 7000, ...over },
  profile: { class: 'RESIDUAL', era: 'e', name, traits: [], signatureDecodedPct: 50 },
});

describe('scan store', () => {
  it('starts empty with a fresh history and standard intensity', () => {
    const s = createScanStore({ storage: null });
    expect(s.listScans()).toEqual([]);
    expect(s.getIntensity()).toBe('standard');
    expect(s.getHistory(5)).toEqual({
      scanCount: 0, scansSinceCritical: null, dryStreak: 0, nowMs: 5, lastJumpScareMs: null, jumpScareThisSession: false,
    });
  });

  it('saves and reads records with sequential ids', () => {
    const s = createScanStore({ storage: null });
    expect(s.saveScan(rec('quiet', 1))).toBe('0001');
    expect(s.saveScan(rec('trace', 2))).toBe('0002');
    expect(s.getScan('0002')?.outcome.tier).toBe('trace');
    expect(s.getScan('9999')).toBeUndefined();
    expect(s.listScans().map((r) => r.id)).toEqual(['0001', '0002']);
  });

  it('derives history: counts, critical distance, dry streak, jump-scare', () => {
    const s = createScanStore({ storage: null, sessionStartMs: 100 });
    s.saveScan(rec('strong', 10));
    s.saveScan(rec('critical', 20, { jumpScare: true }));
    s.saveScan(rec('quiet', 30));
    s.saveScan(rec('active', 40));
    const h = s.getHistory(500);
    expect(h.scanCount).toBe(4);
    expect(h.scansSinceCritical).toBe(3);
    expect(h.dryStreak).toBe(2);
    expect(h.lastJumpScareMs).toBe(20);
    expect(h.jumpScareThisSession).toBe(false);
    s.saveScan(rec('critical', 150, { jumpScare: true }));
    const h2 = s.getHistory(500);
    expect(h2.scansSinceCritical).toBe(1);
    expect(h2.dryStreak).toBe(0);
    expect(h2.lastJumpScareMs).toBe(150);
    expect(h2.jumpScareThisSession).toBe(true);
  });

  it('feeds drawOutcome and generateProfile', () => {
    const s = createScanStore({ storage: null });
    for (let i = 1; i <= 6; i++) {
      const seed = i * 7919;
      const outcome = drawOutcome(seed, s.getIntensity(), s.getHistory(i));
      const profile = generateProfile((seed ^ 0x9e3779b9) >>> 0, outcome.tier, s.getRecentNames());
      s.saveScan({ createdAt: i, photoUri: 'p', seed, outcome, profile });
    }
    expect(s.getHistory().scanCount).toBe(6);
    expect(new Set(s.getRecentNames()).size).toBe(6);
  });

  it('returns the trait lines of the last 20 records', () => {
    const s = createScanStore({ storage: null });
    for (let i = 1; i <= 25; i++) {
      const r = rec('quiet', i);
      s.saveScan({ ...r, profile: { ...r.profile, traits: [1, 2, 3, 4, 5].map((n) => `r${i}-l${n}`) } });
    }
    const lines = s.getRecentLines();
    expect(lines).toHaveLength(100);
    expect(lines[0]).toBe('r6-l1');
    expect(lines.at(-1)).toBe('r25-l5');
    expect(lines.some((l) => l.startsWith('r5-'))).toBe(false);
  });

  it('persists to the provided storage and reloads', () => {
    const storage = mem();
    const a = createScanStore({ storage });
    a.saveScan(rec('strong', 10));
    a.setIntensity('brave');
    const b = createScanStore({ storage });
    expect(b.listScans()).toHaveLength(1);
    expect(b.getIntensity()).toBe('brave');
    expect(b.saveScan(rec('quiet', 11))).toBe('0002');
  });

  it('survives corrupt or throwing storage', () => {
    const bad = mem();
    bad.data.set('fs4.scans.v1', '{nope');
    bad.data.set('fs4.intensity.v1', 'wild');
    const s = createScanStore({ storage: bad });
    expect(s.listScans()).toEqual([]);
    expect(s.getIntensity()).toBe('standard');
    const throwing: KeyValueStore = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    const t = createScanStore({ storage: throwing });
    expect(t.saveScan(rec('quiet', 1))).toBe('0001');
    t.setIntensity('calm');
    expect(t.getIntensity()).toBe('calm');
  });
});

describe('deep scan unlock (P5-04)', () => {
  it('starts locked, unlocks one scan and leaves the others alone', () => {
    const s = createScanStore({ storage: null });
    const a = s.saveScan(rec('active', 1));
    const b = s.saveScan(rec('strong', 2));
    expect(s.getScan(a)?.deepScanAt).toBeUndefined();
    expect(s.unlockDeepScan(a, 1234)).toBe(true);
    expect(s.getScan(a)?.deepScanAt).toBe(1234);
    expect(s.getScan(b)?.deepScanAt).toBeUndefined();
  });

  it('is idempotent and keeps the first time', () => {
    const s = createScanStore({ storage: null });
    const id = s.saveScan(rec('active', 1));
    s.unlockDeepScan(id, 10);
    s.unlockDeepScan(id, 99);
    expect(s.getScan(id)?.deepScanAt).toBe(10);
  });

  it('returns false for a case that is not on file', () => {
    expect(createScanStore({ storage: null }).unlockDeepScan('0042')).toBe(false);
  });

  it('survives a reload: a second store on the same storage reads the unlocked state', () => {
    const storage = mem();
    const first = createScanStore({ storage });
    const id = first.saveScan(rec('critical', 5));
    first.unlockDeepScan(id, 777);
    const second = createScanStore({ storage });
    expect(second.getScan(id)?.deepScanAt).toBe(777);
    expect(second.listScans().filter((r) => r.deepScanAt !== undefined)).toHaveLength(1);
  });
});

describe('declined flag (D-033)', () => {
  it('marks one case, is idempotent, and survives a reload', () => {
    const storage = mem();
    const s = createScanStore({ storage });
    const a = s.saveScan(rec('strong', 1));
    const b = s.saveScan(rec('active', 2));
    expect(s.getScan(a)?.declined).toBeUndefined();
    expect(s.markDeclined(a)).toBe(true);
    expect(s.markDeclined(a)).toBe(true);
    expect(s.getScan(a)?.declined).toBe(true);
    expect(s.getScan(b)?.declined).toBeUndefined();
    expect(createScanStore({ storage }).getScan(a)?.declined).toBe(true);
  });
  it('returns false for a case that is not on file', () => {
    expect(createScanStore({ storage: null }).markDeclined('0042')).toBe(false);
  });
});
