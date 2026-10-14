import type { Tier } from '../../engine';
import { fmtFixed, getLocale } from '../../i18n';
import { mulberry32 } from '../boot/seed';

// The three reading lines on the result screen. The scan record stores no
// sensor values, so they are derived from the record's seed and tier: same
// record, same lines, and a stronger tier reads higher flux, colder and louder.
// Bible section 3 units: mG (1 below 1000, 10 above), dT in 0.1 C, dBFS in 1 dB.

export type Readings = {
  fluxMg: number;
  thermalC: number;
  levelDb: number;
  /** Local minimum under the ambient THERM reading (STRONG line). Never equal to thermalC. */
  coldSpotC: number;
  /** EVP fragment carrier, 180 to 420 Hz (CRITICAL line). */
  evpHz: number;
  /** Carrier drift in kHz, 1.0 to 4.0 (STRONG line, next to the cold spot). */
  driftKhz: number;
};

type Band = { flux: [number, number]; dt: [number, number]; db: [number, number] };

const BANDS: Record<Tier, Band> = {
  quiet: { flux: [280, 520], dt: [-0.8, 0.6], db: [-58, -46] },
  trace: { flux: [420, 780], dt: [-2.4, -0.6], db: [-52, -40] },
  active: { flux: [700, 1200], dt: [-4.6, -2.0], db: [-46, -32] },
  strong: { flux: [1100, 1650], dt: [-7.0, -4.0], db: [-40, -24] },
  critical: { flux: [1600, 2000], dt: [-9.0, -6.5], db: [-30, -12] },
};

const between = (r: number, [lo, hi]: [number, number]) => lo + r * (hi - lo);

export function readingsFor(seed: number, tier: Tier): Readings {
  const r = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  const b = BANDS[tier];
  const raw = between(r(), b.flux);
  const fluxMg = raw >= 1000 ? Math.min(2000, Math.round(raw / 10) * 10) : Math.round(raw);
  const thermalC = Math.round(between(r(), b.dt) * 10) / 10;
  const levelDb = Math.round(between(r(), b.db));
  // Drawn after the three readings so those keep their values for a given seed.
  const coldSpotC = Math.max(-12, Math.round((thermalC - between(r(), [0.6, 1.8])) * 10) / 10);
  const evpHz = Math.round(between(r(), [180, 420]));
  // Drawn last so every earlier reading keeps its value for a given seed.
  const driftKhz = Math.round(between(r(), [1, 4]) * 10) / 10;
  return { fluxMg, thermalC, levelDb, coldSpotC, evpHz, driftKhz };
}

export function formatReadings({ fluxMg, thermalC, levelDb }: Pick<Readings, 'fluxMg' | 'thermalC' | 'levelDb'>) {
  return {
    flux: `${fluxMg} mG`,
    thermal: `${fmtFixed(thermalC, 1, getLocale())} °C`,
    level: `${levelDb} dBFS`,
  };
}
