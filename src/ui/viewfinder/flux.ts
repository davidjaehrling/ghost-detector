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

// Live-mode ladder (Bible section 3): LED 1 is power, the rest follow the
// distance from the GEO band. LED 5 never lights here.
export function liveLeds(mg: number): number {
  const r = mg > GEO_HIGH ? mg / GEO_HIGH : mg < GEO_LOW ? GEO_LOW / mg : 1;
  if (r <= 1) return 1;
  if (r < 1.4) return 2;
  if (r < 2) return 3;
  return 4;
}
