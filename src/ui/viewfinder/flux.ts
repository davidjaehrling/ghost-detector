import { mulberry32 } from '../boot/seed';

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
  return `FLUX ${String(mg).padStart(4, ' ')} mG`;
}

// Live-mode ladder (Bible section 3, D-007): LED 1 is power; LED 2 and 3 light
// at 15% and 40% away from the GEO centre, LED 4 at 75%. LED 5 never lights here.
export const GEO_CENTRE = 400;
export const LED_STEPS = [0.15, 0.4, 0.75] as const;

export function liveLeds(mg: number): number {
  const dev = Math.abs(mg - GEO_CENTRE) / GEO_CENTRE;
  return 1 + LED_STEPS.filter((s) => dev >= s).length;
}

// Cold-spot style gradient shown next to the flux: it dips as the field leaves
// the GEO centre, so the two readouts move together. dT stays in -12.0 to +6.0.
export function liveThermal(mg: number): number {
  const dev = (mg - GEO_CENTRE) / GEO_CENTRE;
  const dt = -0.3 - Math.max(0, dev) * 3.2 - Math.max(0, -dev) * 0.8;
  return Math.round(Math.min(6, Math.max(-12, dt)) * 10) / 10;
}
