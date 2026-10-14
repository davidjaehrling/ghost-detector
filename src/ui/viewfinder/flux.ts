import { mulberry32 } from '../boot/seed';
import { type Tier, needle } from '../tokens';
import { fmtDeltaT, getLocale, t } from '../../i18n';

// Seeded flux walk for the viewfinder HUD. Mean-reverting in the log domain
// around Earth's field (Bible section 3: 250 to 650 mG), with rare excursions.
// Same seed, same sequence. One call to next() is one 10 Hz tick.

export const GEO_LOW = 250;
export const GEO_HIGH = 650;
export const FLUX_MIN = 10;
export const FLUX_MAX = 2000;
export const ARC_DEG = 100;

export type FluxSample = { mg: number; jitter: number };

export function createFluxWalk(seed: number) {
  const r = mulberry32(seed);
  let x = Math.log(300 + r() * 200);
  let burst = 0;
  let aim = Math.log(400);
  return {
    next(): FluxSample {
      if (burst > 0) {
        burst--;
        if (burst === 0) aim = Math.log(380 + r() * 80);
      } else if (r() < 0.012) {
        burst = 8 + Math.floor(r() * 18);
        aim = Math.log(700 + r() * 800);
      }
      x += (aim - x) * 0.12 + (r() - 0.5) * 0.05;
      const raw = Math.min(FLUX_MAX, Math.max(FLUX_MIN, Math.exp(x)));
      const mg = raw >= 1000 ? Math.round(raw / 10) * 10 : Math.round(raw);
      return { mg, jitter: (r() - 0.5) * 2 };
    },
  };
}

// Dial angle in degrees from straight up: log scale, FLUX_MIN to FLUX_MAX over 100 degrees.
export function fluxAngle(mg: number): number {
  const c = Math.min(FLUX_MAX, Math.max(FLUX_MIN, mg));
  return (Math.log(c / FLUX_MIN) / Math.log(FLUX_MAX / FLUX_MIN) - 0.5) * ARC_DEG;
}

export function formatFlux(mg: number): string {
  return t('viewfinder.flux', { mg: String(mg).padStart(4, ' ') });
}

// Live-mode ladder (Bible section 3, D-007): LED 1 is power; LED 2 and 3 light
// at 15% and 40% away from the GEO centre, LED 4 at 75%. LED 5 never lights here.
export const GEO_CENTRE = 400;
export const LED_STEPS = [0.15, 0.4, 0.75] as const;

// Deviation from the GEO centre in whole percent, as the HUD shows it. The ladder reads the
// same rounded number, so the line and the LEDs always agree.
export function geoDeviation(mg: number): number {
  // Truncated, so a step shows only once the whole percentage has been reached.
  return Math.trunc(Math.round(((mg - GEO_CENTRE) / GEO_CENTRE) * 1e6) / 1e4);
}

export function formatGeo(mg: number): string {
  const d = geoDeviation(mg);
  return t('viewfinder.geo', { sign: d < 0 ? '-' : '+', pct: Math.abs(d) });
}

export function liveLeds(mg: number): number {
  const dev = Math.abs(geoDeviation(mg)) / 100;
  return 1 + LED_STEPS.filter((s) => dev >= s - 1e-9).length;
}

// The scene's tier while live: the rungs of the ladder read as QUIET to STRONG (never CRITICAL).
const LIVE_TIERS: readonly Tier[] = ['quiet', 'trace', 'active', 'strong'];
export const liveTier = (mg: number): Tier => LIVE_TIERS[liveLeds(mg) - 1]!;

// Cold-spot style gradient shown next to the flux: it dips as the field leaves
// the GEO centre, so the two readouts move together. dT stays in -12.0 to +6.0.
export function liveThermal(mg: number): number {
  const dev = (mg - GEO_CENTRE) / GEO_CENTRE;
  const dt = -0.3 - Math.max(0, dev) * 3.2 - Math.max(0, -dev) * 0.8;
  return Math.round(Math.min(6, Math.max(-12, dt)) * 10) / 10;
}

export const formatThermal = (dt: number) => fmtDeltaT(dt, getLocale());

// The live reading wobbles by 0.1 °C around its mean: the displayed digit lifts or drops one step.
export const THERMAL_WOBBLE = 0.1;

// `mg` is the flux the reading follows, `wobble` is -1, 0 or 1. Stays in -12.0 to +6.0.
export function liveThermalStep(mg: number, wobble: number): number {
  const dt = liveThermal(mg) + Math.max(-1, Math.min(1, Math.round(wobble))) * THERMAL_WOBBLE;
  return Math.round(Math.min(6, Math.max(-12, dt)) * 10) / 10;
}

// ---------- magnetometer mapping (P4-05, Bible section 3 and 6) ----------

// Flux uses the real magnetometer: 1 microtesla = 10 milligauss (Earth's field, 25 to 65 uT,
// reads 250 to 650 mG).
export const UT_TO_MG = 10;
export const microTeslaToMilliGauss = (ut: number) => ut * UT_TO_MG;

export type Vec3 = { x: number; y: number; z: number };
export const magnitudeUt = ({ x, y, z }: Vec3) => Math.hypot(x, y, z);

// Display resolution: 1 mG below 1000, 10 mG above, pegged at 0 and 2000.
export function quantizeMg(mg: number): number {
  const c = Math.min(FLUX_MAX, Math.max(0, mg));
  return c >= 1000 ? Math.round(c / 10) * 10 : Math.round(c);
}

// One magnetometer sample as a flux sample. `unit` is a seeded draw in -1..1 for the needle
// jitter (the same field the seeded walk returns), so the real sensor and the walk drive the
// needle alike.
export const sampleFromVector = (v: Vec3, unit: number): FluxSample => ({ mg: quantizeMg(microTeslaToMilliGauss(magnitudeUt(v))), jitter: unit });

// Needle jitter: plus or minus 0.6% of full scale (Bible section 6) on top of the sensor's own
// noise. The arc is 100 degrees, so 0.6% of it is 0.6 degrees. Off under reduced motion.
export const JITTER_DEG = needle.jitter * ARC_DEG;

export function jitteredAngle(mg: number, unit: number, reduceMotion = false): number {
  return fluxAngle(mg) + (reduceMotion ? 0 : Math.max(-1, Math.min(1, unit)) * JITTER_DEG);
}

// The spring's damping ratio, from the Bible's constants: live 0.70, reveal 0.45.
export const dampingRatio = (s: { mass: number; stiffness: number; damping: number }) => s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
