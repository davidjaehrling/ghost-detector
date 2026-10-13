/**
 * Seeded scan outcome. Tables and rules: docs/psych-brief.md sections 2.4 and 3.
 * Pure: the same (seed, intensity, history) always gives the same Outcome.
 */
import { mulberry32 } from './rng';
import { TIERS, tierBand, type Tier } from './tiers';

export type Intensity = 'calm' | 'standard' | 'brave';

/** Tier probabilities, QUIET to CRITICAL, per intensity (brief section 3). */
export const TIER_TABLE: Record<Intensity, readonly [number, number, number, number, number]> = {
  calm: [30, 40, 22, 7, 1],
  standard: [20, 35, 28, 13, 4],
  brave: [12, 28, 32, 20, 8],
};

/** Consecutive scans at or below ACTIVE before STRONG is forced. */
export const DRY_SPELL: Record<Intensity, number> = { calm: 16, standard: 12, brave: 8 };

/** Chance of a figure on ACTIVE (brief section 3 figure rule). STRONG/CRITICAL always; TRACE never. */
export const FIGURE_ON_ACTIVE: Record<Intensity, number> = { calm: 0.5, standard: 0.6, brave: 0.7 };

/** Chance of a jump-scare given CRITICAL. */
export const JUMP_SCARE_ON_CRITICAL: Record<Intensity, number> = { calm: 0, standard: 0.25, brave: 0.5 };

export const MIN_CRITICAL_SPACING = 5;
export const NO_CRITICAL_BEFORE = 3; // scans 1..3 never CRITICAL; the table applies from scan 4
export const NO_JUMP_BEFORE = 3;
export const DAY_MS = 24 * 60 * 60 * 1000;

export interface OutcomeHistory {
  /** Scans completed on this install before this one. 0 means this is scan 1. */
  scanCount: number;
  /** Distance in scans back to the last CRITICAL (1 = the previous scan). null if none yet. */
  scansSinceCritical: number | null;
  /** Consecutive most recent scans at or below ACTIVE. */
  dryStreak: number;
  /** Time of this scan, ms since epoch (used for the 24 h jump-scare cap). */
  nowMs: number;
  /** Time of the last jump-scare, or null. Standard allows one per 24 h. */
  lastJumpScareMs: number | null;
  /** A jump-scare already fired in this app session. Brave allows one per session. */
  jumpScareThisSession: boolean;
}

export interface Outcome {
  tier: Tier;
  /** Integer inside the tier's band. */
  spi: number;
  /** Full figure in the dark region. */
  figureShown: boolean;
  /** TRACE only: a blurred vertical density with no head shape (25% of TRACE). */
  smudge: boolean;
  jumpScare: boolean;
  scanDurationMs: number;
}

/** A history that disables every special rule, for distribution checks. */
export function freshHistory(nowMs = 0): OutcomeHistory {
  return { scanCount: 1000, scansSinceCritical: null, dryStreak: 0, nowMs, lastJumpScareMs: null, jumpScareThisSession: false };
}

/** FNV-1a over the photo hash, mixed with the timestamp. Different photos or times give different seeds. */
export function seedFrom(photoHash: string, timestampMs: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < photoHash.length; i++) {
    h ^= photoHash.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const ts = Math.floor(timestampMs);
  h ^= ts >>> 0;
  h = Math.imul(h, 0x01000193);
  h ^= Math.floor(ts / 4294967296) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function pickTier(r: number, row: readonly number[]): Tier {
  let acc = 0;
  for (let i = 0; i < row.length; i++) {
    acc += row[i]! / 100;
    if (r < acc) return TIERS[i]!;
  }
  return 'critical';
}

export function drawOutcome(seed: number, intensity: Intensity, history: OutcomeHistory): Outcome {
  const rng = mulberry32(seed);
  // Fixed draw order so every field is stable whatever branch is taken.
  const rTier = rng(), rSpi = rng(), rFigure = rng(), rSmudge = rng(), rJump = rng();
  const rDur = rng(), rExt = rng(), rExtLen = rng();

  let tier: Tier;
  if (history.scanCount === 0) {
    tier = rTier < 0.7 ? 'active' : 'strong'; // scan 1
  } else {
    tier = pickTier(rTier, TIER_TABLE[intensity]);
    const blocked =
      history.scanCount < NO_CRITICAL_BEFORE ||
      (history.scansSinceCritical !== null && history.scansSinceCritical < MIN_CRITICAL_SPACING);
    if (tier === 'critical' && blocked) tier = 'strong';
    if (history.dryStreak >= DRY_SPELL[intensity] && TIERS.indexOf(tier) <= TIERS.indexOf('active')) tier = 'strong';
  }

  const band = tierBand(tier);
  const spi = band.min + Math.floor(rSpi * (band.max - band.min + 1));

  const figureShown =
    tier === 'strong' || tier === 'critical' ? true : tier === 'active' ? rFigure < FIGURE_ON_ACTIVE[intensity] : false;
  const smudge = tier === 'trace' && rSmudge < 0.25;

  let jumpScare = false;
  if (tier === 'critical' && history.scanCount >= NO_JUMP_BEFORE && rJump < JUMP_SCARE_ON_CRITICAL[intensity]) {
    const dayCapped =
      intensity === 'standard' && history.lastJumpScareMs !== null && history.nowMs - history.lastJumpScareMs < DAY_MS;
    const sessionCapped = intensity === 'brave' && history.jumpScareThisSession;
    jumpScare = !dayCapped && !sessionCapped;
  }

  const high = tier === 'strong' || tier === 'critical';
  const extended = high || rExt < 0.3;
  const scanDurationMs = Math.round(6000 + rDur * 2000 + (extended ? 1000 + rExtLen * 1000 : 0));

  return { tier, spi, figureShown, smudge, jumpScare, scanDurationMs };
}
