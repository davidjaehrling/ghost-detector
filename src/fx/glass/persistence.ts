import type { PhosphorStep } from './color';

// Bible §4 and §6: anything that moves leaves a trail that starts at the element's step and
// drops one step per interval until p0, then fades out. Interval = tau / 3, which gives the
// Bible's 60 ms per step for traces (tau 180) and 150 ms for the sweep (tau 450).
// Reduced motion caps tau at 60 ms (Bible §7).

export const REDUCED_TAU = 60;

export function effectiveTau(tau: number, reduceMotion = false): number {
  return reduceMotion ? Math.min(tau, REDUCED_TAU) : tau;
}

// Longest age at which a trail sample is still drawn.
export function trailLifetime(startStep: PhosphorStep, tau: number): number {
  return (startStep + 1) * (tau / 3) + tau;
}

// Colour step and opacity of a sample `ageMs` old, or null once it has faded out.
// Age 0 is the live element itself (start step, full opacity).
export function trailStyle(startStep: PhosphorStep, ageMs: number, tau: number): { step: PhosphorStep; opacity: number } | null {
  if (ageMs < 0) return { step: startStep, opacity: 1 };
  const interval = tau / 3;
  const down = Math.floor(ageMs / interval);
  if (down <= startStep) return { step: (startStep - down) as PhosphorStep, opacity: 1 };
  const fade = 1 - (ageMs - (startStep + 1) * interval) / tau;
  return fade > 0 ? { step: 0, opacity: fade } : null;
}

// Brightness 0 -> 1 with the default ease-out curve (Bible §7).
export function warmBrightness(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  // cubic-bezier(0.2, 0, 0, 1) is close to 1 - (1 - x)^3 over this range.
  return 1 - (1 - x) ** 3;
}
