import type { PhosphorStep } from '../../fx/glass/color';
import { geoDeviation, liveLeds } from './flux';

// Live radar sweep for the viewfinder (P4-06, Bible section 6: tau 450 ms, a visible tail of
// about 1.2 s). A line turns about the reticle centre. Its speed follows the flux (the further
// the field is from the GEO centre the faster it turns) and its brightness follows the live
// tier, the LED ladder. Degrees run clockwise from straight up.

export const SWEEP_SLOW_MS = 5200; // one turn at the GEO centre
export const SWEEP_FAST_MS = 1800; // one turn when the field is far off it
const DEV_FULL = 1.5; // 150% off the centre counts as full speed

// Milliseconds per turn for a flux reading.
export function sweepPeriodMs(mg: number): number {
  const dev = Math.min(DEV_FULL, Math.abs(geoDeviation(mg)) / 100) / DEV_FULL;
  return Math.round(SWEEP_SLOW_MS + (SWEEP_FAST_MS - SWEEP_SLOW_MS) * dev);
}

// Phosphor step of the sweep line: p3 on the first two rungs of the ladder, p4 above.
export function sweepStep(mg: number): PhosphorStep {
  return liveLeds(mg) >= 3 ? 4 : 3;
}

// Frozen angle under ?static=1, so goldens repeat.
export const SWEEP_STATIC_DEG = 52;

// Angle after `dtMs` more time, wrapped to 0..360. A long stall (a backgrounded tab) advances by
// at most 100 ms so the line never jumps.
export function advanceSweep(deg: number, dtMs: number, periodMs: number): number {
  const dt = Math.max(0, Math.min(100, dtMs));
  return (deg + (dt * 360) / periodMs) % 360;
}

// The point on a circle of `radius` about (cx, cy) at `deg`.
export function sweepPoint(cx: number, cy: number, radius: number, deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: cx + radius * Math.sin(a), y: cy - radius * Math.cos(a) };
}
