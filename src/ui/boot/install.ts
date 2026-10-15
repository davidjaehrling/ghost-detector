import { mulberry32 } from './seed';
import { platformStorage } from '../../state/storage';

// Per-install identity (Bible section 1 and 11): serial FS4-YYWW-NNNNN-C with a
// Luhn check digit, CAL date, and an inspector stamp PRÜF 01 to 12.

export type InstallIdentity = { serial: string; cal: string; pruef: string };

// Fixed seed for the web harness (?date=), so goldens are deterministic.
export const FIXED_SEED = 417;

export function luhnCheckDigit(payload: string): number {
  let sum = 0;
  for (let i = 0; i < payload.length; i++) {
    let d = Number(payload[payload.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

export function luhnValid(digits: string): boolean {
  return luhnCheckDigit(digits.slice(0, -1)) === Number(digits.slice(-1));
}

export function serialFor(yy: number, ww: number, unit: number): string {
  const body = `${String(yy).padStart(2, '0')}${String(ww).padStart(2, '0')}`;
  const nnnnn = String(unit).padStart(5, '0');
  return `FS4-${body}-${nnnnn}-${luhnCheckDigit(body + nnnnn)}`;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function identityFromSeed(seed: number, date: Date): InstallIdentity {
  if (seed === FIXED_SEED) {
    return { serial: serialFor(87, 11, 417), cal: iso(date), pruef: '07' };
  }
  const r = mulberry32(seed);
  const yy = 86 + Math.floor(r() * 4); // build 8601 to 8952
  const ww = 1 + Math.floor(r() * 52);
  const unit = 1 + Math.floor(r() * 4800);
  const pruef = 1 + Math.floor(r() * 12);
  return { serial: serialFor(yy, ww, unit), cal: iso(date), pruef: String(pruef).padStart(2, '0') };
}

// DUE is CAL plus twelve months, month precision: `2026-10-13` -> `2027-10`.
export function dueFor(cal: string): string {
  const [y, m] = cal.split('-');
  return `${Number(y) + 1}-${m}`;
}

// The install seed is created once and kept in the platform storage. Never throws.
const KEY = 'install-seed';
let memorySeed: number | null = null;

export function readInstallSeed(): number {
  if (memorySeed !== null) return memorySeed;
  let seed: number | null = null;
  try {
    const ls = platformStorage();
    const raw = ls?.getItem(KEY);
    if (raw) seed = Number(raw);
    if (seed === null || !Number.isFinite(seed)) {
      seed = Math.floor(Math.random() * 2 ** 31);
      ls?.setItem(KEY, String(seed));
    }
  } catch {
    seed = seed ?? Math.floor(Math.random() * 2 ** 31);
  }
  memorySeed = seed;
  return seed;
}

// With an explicit `seed` the result is a pure function of (seed, date).
export function getInstallIdentity(date: Date = new Date(), seed: number = readInstallSeed()): InstallIdentity {
  return identityFromSeed(seed, date);
}
