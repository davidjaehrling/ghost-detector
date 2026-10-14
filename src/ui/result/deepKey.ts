import type { Tier } from '../../engine';
import type { DeepState } from './deepScan';

// DEEP SCAN on hardware key 4 (D-045 ruling 1). Two steps: the first press arms the key and prints
// the sponsored-video line directly above it; the second press runs the ad. Any other key cancels
// the arm. A press within GUARD_MS of the result screen appearing does nothing at all, so a thumb
// still on the NEW SCAN key (slot 1) or a tap through from the scan never starts an ad.

/** A press this soon after the result appears is ignored. */
export const DEEP_GUARD_MS = 500;

export type DeepPress = 'ignore' | 'arm' | 'run';

/** What a press of key 4 does. Only a ready key reacts; an armed key runs, a fresh one arms. */
export function deepPress(o: { state: DeepState; armed: boolean; sinceShownMs: number }): DeepPress {
  if (o.state !== 'ready') return 'ignore';
  if (o.sinceShownMs < DEEP_GUARD_MS) return 'ignore';
  return o.armed ? 'run' : 'arm';
}

/** Tiers whose key 4 may carry the DEEP SCAN offer. QUIET (LOG) and TRACE (dark) never do. */
export const deepTier = (tier: Tier): boolean => tier === 'active' || tier === 'strong' || tier === 'critical';
