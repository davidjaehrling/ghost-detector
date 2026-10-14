/**
 * Pure parts of two scope effects Builder A's components draw (no Skia, Vitest-tested):
 * - A-32 (D-045 ruling 8): the sweep's head bloom and fading tail. A 1 px p5 head, then an
 *   exponential tail through p3, p2 and p1 that is gone within about SWEEP_FADE_PX of arc
 *   (Bible section 6: tau 450 ms), so the sweep never reads as a flat green fill.
 * - A-11 (D-045 ruling 8): the boot transient varies per launch: 1.2 to 2.5 divisions, at 40 to 80%
 *   of the sweep, and about one boot in four logs `TRANSIENT 0` with no spike. Frozen under the
 *   harness seed so the golden is stable.
 */
import { mulberry32 } from '../../engine';
import { PHOSPHOR, withAlpha } from '../glass/color';

/** Arc length, px, over which the tail fades to nothing (exp(-3) at the end). */
export const SWEEP_FADE_PX = 60;
/** Tail steps by distance behind the head, as shares of SWEEP_FADE_PX: p5 head, then p3, p2, p1. */
export const TAIL_STEPS: readonly { at: number; step: 1 | 2 | 3 | 5 }[] = [
  { at: 0, step: 5 },
  { at: 0.04, step: 3 },
  { at: 0.3, step: 2 },
  { at: 0.6, step: 1 },
];

/** Tail alpha at `d` px behind the head: 1 at the head, exp(-3 d / SWEEP_FADE_PX), 0 past the fade length. */
export function tailAlpha(d: number): number {
  if (d < 0) return 0;
  if (d > SWEEP_FADE_PX) return 0;
  return Math.exp((-3 * d) / SWEEP_FADE_PX);
}

/** Phosphor step of the tail at `d` px behind the head. */
export function tailStep(d: number): 1 | 2 | 3 | 5 {
  let s: 1 | 2 | 3 | 5 = 5;
  for (const t of TAIL_STEPS) if (d >= t.at * SWEEP_FADE_PX) s = t.step;
  return s;
}

/**
 * Sweep gradient stops for a wedge of `sectorDeg` degrees drawn at radius `radiusPx` (the arc the
 * tail is measured on): `positions` 0 (oldest edge) to 1 (leading edge) and rgba `colors`, for a
 * SweepGradient from `270 - sectorDeg` to 270. Past the fade length the stops are transparent.
 */
export function sweepBloomStops(sectorDeg: number, radiusPx: number): { positions: number[]; colors: string[] } {
  const arc = Math.max(1, (sectorDeg * Math.PI * radiusPx) / 180);
  const ds = [0, 1, 0.04, 0.15, 0.3, 0.45, 0.6, 0.8, 1].map((k, i) => (i === 1 ? 1 : k * SWEEP_FADE_PX));
  const uniq = [...new Set(ds.filter((d) => d <= arc))].sort((a, b) => b - a);
  const positions: number[] = [];
  const colors: string[] = [];
  if (arc > SWEEP_FADE_PX) {
    positions.push(0);
    colors.push(withAlpha(PHOSPHOR[1], 0));
  }
  for (const d of uniq) {
    positions.push(1 - d / arc);
    colors.push(withAlpha(PHOSPHOR[tailStep(d)], d >= SWEEP_FADE_PX ? 0 : tailAlpha(d)));
  }
  return { positions, colors };
}

export interface BootSpike {
  /** False on about one boot in four: no spike, the glass logs `TRANSIENT 0`. */
  fires: boolean;
  /** The count the boot line prints: 1 when it fires, else 0. */
  count: 0 | 1;
  /** Peak height in divisions, 1.2 to 2.5. */
  div: number;
  /** Where on the sweep it rises, as a share of the grid width, 0.4 to 0.8. */
  at: number;
}

export const SPIKE_DIV_RANGE: readonly [number, number] = [1.2, 2.5];
export const SPIKE_AT_RANGE: readonly [number, number] = [0.4, 0.8];
export const SPIKE_SKIP = 0.25;
/** The harness value (golden): the spike that fires, 2 divisions at 60% of the sweep. */
export const HARNESS_SPIKE: BootSpike = { fires: true, count: 1, div: 2, at: 0.6 };

/** The boot transient for one launch: `launchSeed` changes per launch; `harness` freezes it. */
export function bootSpike(launchSeed: number, harness = false): BootSpike {
  if (harness) return HARNESS_SPIKE;
  const r = mulberry32((launchSeed ^ 0x2b7e1516) >>> 0);
  const fires = r() >= SPIKE_SKIP;
  const div = Math.round((SPIKE_DIV_RANGE[0] + r() * (SPIKE_DIV_RANGE[1] - SPIKE_DIV_RANGE[0])) * 100) / 100;
  const at = Math.round((SPIKE_AT_RANGE[0] + r() * (SPIKE_AT_RANGE[1] - SPIKE_AT_RANGE[0])) * 1000) / 1000;
  return { fires, count: fires ? 1 : 0, div, at };
}
