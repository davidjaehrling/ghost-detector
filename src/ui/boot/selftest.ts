import { mulberry32 } from './seed';

// Self-test lines with seeded readings, in fixed columns:
// label (6), value right-aligned (4), unit (4), status.
// Ranges stay inside the Bible section 3 ranges and read as a healthy unit.

export type SelfTestLine = { label: string; value: string; unit: string; status: string };

const sign = (n: number) => (n < 0 ? '-' : '+');

export function selfTestReadings(seed: number): SelfTestLine[] {
  const r = mulberry32(seed);
  const flux = 250 + Math.floor(r() * 400); // Earth field band, mG
  const therm = Math.round((r() * 2 - 1) * 10) / 10; // dT, 0.1 C
  const acoust = -(45 + Math.floor(r() * 15)); // dBFS
  return [
    { label: 'FLUX', value: String(flux), unit: 'mG', status: 'OK' },
    { label: 'THERM', value: `${sign(therm)}${Math.abs(therm).toFixed(1)}`, unit: '°C', status: 'OK' },
    { label: 'ACOUST', value: String(acoust), unit: 'dBFS', status: 'OK' },
  ];
}

export function formatSelfTest({ label, value, unit, status }: SelfTestLine): string {
  return `${label.padEnd(6)} ${value.padStart(4)} ${unit.padEnd(4)} ${status}`;
}
