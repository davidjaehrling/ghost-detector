import { describe, expect, it } from 'vitest';
import { FIXED_SEED, getInstallIdentity, identityFromSeed, luhnCheckDigit, luhnValid, serialFor } from '../install';
import { formatSelfTest, selfTestReadings } from '../selftest';

describe('luhn', () => {
  it('matches the standard test vector 7992739871 -> 3', () => {
    expect(luhnCheckDigit('7992739871')).toBe(3);
    expect(luhnValid('79927398713')).toBe(true);
    expect(luhnValid('79927398710')).toBe(false);
  });
});

describe('serial', () => {
  it('follows FS4-YYWW-NNNNN-C with a valid check digit', () => {
    expect(serialFor(87, 11, 417)).toBe('FS4-8711-00417-9');
    for (const seed of [1, 2, 99, 123456, FIXED_SEED]) {
      const { serial } = identityFromSeed(seed, new Date(2026, 9, 13));
      const m = /^FS4-(\d{4})-(\d{5})-(\d)$/.exec(serial);
      expect(m, serial).not.toBeNull();
      expect(luhnValid(`${m![1]}${m![2]}${m![3]}`), serial).toBe(true);
      const yy = Number(m![1].slice(0, 2));
      const ww = Number(m![1].slice(2));
      expect(yy).toBeGreaterThanOrEqual(86);
      expect(yy).toBeLessThanOrEqual(89);
      expect(ww).toBeGreaterThanOrEqual(1);
      expect(ww).toBeLessThanOrEqual(52);
      const unit = Number(m![2]);
      expect(unit).toBeGreaterThanOrEqual(1);
      expect(unit).toBeLessThanOrEqual(4800);
    }
  });

  it('is deterministic for a seed and date', () => {
    const d = new Date(2026, 9, 13, 12, 0);
    expect(getInstallIdentity(d, FIXED_SEED)).toEqual(getInstallIdentity(d, FIXED_SEED));
    expect(getInstallIdentity(d, FIXED_SEED)).toEqual({ serial: 'FS4-8711-00417-9', cal: '2026-10-13', pruef: '07' });
    expect(identityFromSeed(5, d)).toEqual(identityFromSeed(5, d));
  });

  it('PRÜF stays within 01 to 12 and seeds differ', () => {
    const d = new Date(2026, 9, 13);
    const stamps = new Set<string>();
    for (let seed = 1; seed < 200; seed++) {
      const { pruef } = identityFromSeed(seed, d);
      expect(Number(pruef)).toBeGreaterThanOrEqual(1);
      expect(Number(pruef)).toBeLessThanOrEqual(12);
      stamps.add(pruef);
    }
    expect(stamps.size).toBeGreaterThan(6);
  });
});

describe('selfTestReadings', () => {
  it('is deterministic and stays in range', () => {
    expect(selfTestReadings(20261013)).toEqual(selfTestReadings(20261013));
    for (let seed = 0; seed < 100; seed++) {
      const [flux, therm, acoust] = selfTestReadings(seed);
      expect(Number(flux.value)).toBeGreaterThanOrEqual(250);
      expect(Number(flux.value)).toBeLessThanOrEqual(650);
      expect(Math.abs(Number(therm.value))).toBeLessThanOrEqual(1);
      expect(Number(acoust.value)).toBeLessThanOrEqual(-45);
      expect(Number(acoust.value)).toBeGreaterThanOrEqual(-60);
    }
  });

  it('formats to fixed columns', () => {
    const lines = selfTestReadings(7).map(formatSelfTest);
    expect(new Set(lines.map((l) => l.length)).size).toBe(1);
    expect(lines[0]).toMatch(/^FLUX {2}\s*\d+ mG {3}OK$/);
    expect(lines[1]).toMatch(/^THERM [ ]*[+-]\d\.\d °C {3}OK$/);
    expect(lines[2]).toMatch(/^ACOUST [ ]*-\d+ dBFS OK$/);
  });
});
