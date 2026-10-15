import { NEAR_BLACK } from './reference';
import type { LumaGrid } from './regionStats';

// Auto-gain on a near-black photo (A-45, D-045): the probe's front end raises its gain in fixed
// 6 dB steps until the scene's mean sits near GAIN_TARGET luma (which the phosphor tint then lifts
// to about p1), at most GAIN_MAX_DB. Only a near-black scene (median luma under NEAR_BLACK, the
// same rule as the smudge fallback) is gained; every other photo is drawn as captured. The gain
// multiplies the photo before the ghost and the clamp, so the clamp, the occlusion and the
// near-black ceiling all read the gained scene, and the grain rises with it (a gained sensor is
// noisier). Pure: the result screen and the card get the same numbers from the same grid.

/** Scene mean the gain aims for, 0..255 luma, before the tint (the tint lifts about 40 to about 56, p1). */
export const GAIN_TARGET = 40;
/** Gain steps and ceiling, dB (amplitude: 10^(dB / 20)). */
export const GAIN_STEP_DB = 6;
export const GAIN_MAX_DB = 24;
/** Grain multiplier at GAIN_MAX_DB (linear in dB from 1 at 0 dB; never under the near-black 1.5). */
export const GAIN_GRAIN_AT_MAX = 2;

export interface AutoGain {
  /** Gain in dB, a multiple of GAIN_STEP_DB (0: none). The strip prints it as `GAIN +24 dB`. */
  db: number;
  /** Linear factor on the photo's channels. */
  factor: number;
  /** Grain multiplier for the gained scene (1 when db is 0). */
  grain: number;
}

export const NO_GAIN: AutoGain = { db: 0, factor: 1, grain: 1 };

function stats(luma: ArrayLike<number>): { mean: number; median: number } {
  if (!luma.length) return { mean: 0, median: 0 };
  const s = Array.from(luma).sort((a, b) => a - b);
  let sum = 0;
  for (const v of s) sum += v;
  return { mean: sum / s.length, median: s[s.length >> 1]! };
}

/** The gain for a photo's luma grid (`RegionStats.grid`), or NO_GAIN without one or on a lit scene. */
export function autoGain(grid: LumaGrid | null | undefined): AutoGain {
  if (!grid || !grid.luma.length) return NO_GAIN;
  const { mean, median } = stats(grid.luma);
  if (median >= NEAR_BLACK) return NO_GAIN;
  const want = 20 * Math.log10(GAIN_TARGET / Math.max(0.5, mean));
  const db = Math.max(0, Math.min(GAIN_MAX_DB, Math.floor(want / GAIN_STEP_DB) * GAIN_STEP_DB));
  if (db === 0) return NO_GAIN;
  return { db, factor: 10 ** (db / 20), grain: 1 + ((GAIN_GRAIN_AT_MAX - 1) * db) / GAIN_MAX_DB };
}
