/**
 * Pure helpers for the scan scope (`ScopeLayer`). No Skia, so they run under Vitest.
 */
import { mulberry32 } from '../../engine';

/** Trace points every this many px. */
export const TRACE_SEG = 6;
/** Sweep tail length as a share of the grid width; the tail fades as exp(-4 d / tail). */
export const SWEEP_TAIL = 0.34;
/** The torn frames: the first TEAR_MS of the fault beat (2 to 3 frames of the 20 Hz scan clock). */
export const TEAR_MS = 120;
/** Rows of a torn frame move 4 to 12 px sideways. */
export const TEAR_PX: readonly [number, number] = [4, 12];
/** Brightness dip over the glass: 30% for the first 400 ms of the fault beat. */
export const DIP = 0.3;
export const DIP_MS = 400;

export type TearBand = { y: number; h: number; dx: number };

export function sweepTail(gw: number): number {
  return Math.max(16, Math.round(gw * SWEEP_TAIL));
}

/**
 * Bands of a torn frame at `faultT` ms into the fault beat, or null once the tear is over. The
 * grid is cut into 4 to 6 horizontal bands; every other band moves 4 to 12 px left or right, so
 * the picture reads as a horizontal hold slip. Each 50 ms clock frame tears differently.
 */
export function faultTear(seed: number, faultT: number, gh: number): TearBand[] | null {
  if (faultT < 0 || faultT >= TEAR_MS || gh <= 0) return null;
  const rnd = mulberry32((seed ^ Math.imul(Math.floor(faultT / 50) + 1, 0x27d4eb2d)) >>> 0);
  const n = 4 + Math.floor(rnd() * 3);
  const cuts = [0];
  for (let i = 1; i < n; i++) cuts.push(Math.round((gh * (i + (rnd() - 0.5) * 0.6)) / n));
  cuts.push(gh);
  const bands: TearBand[] = [];
  const first = rnd() < 0.5 ? 0 : 1;
  for (let i = 0; i < n; i++) {
    const shifted = i % 2 === first;
    const mag = TEAR_PX[0] + rnd() * (TEAR_PX[1] - TEAR_PX[0]);
    bands.push({ y: cuts[i]!, h: cuts[i + 1]! - cuts[i]!, dx: shifted ? Math.round(mag) * (rnd() < 0.5 ? -1 : 1) : 0 });
  }
  return bands;
}

/** Opacity of the n0 dip over the glass at `faultT` ms into the fault beat. */
export function faultDip(faultT: number): number {
  return faultT >= 0 && faultT < DIP_MS ? DIP : 0;
}
