import type { Intensity } from '../engine';
import { type KeyValueStore, setIntensity, webStorage } from './scans';

// Belief calibration (docs/psych-brief.md section 2.9): one answer, asked once
// after the sticker, sets the intensity, the priming strength and the figure
// opacity band. Stored on the device; never asked again.

export type Belief = 'yes' | 'unsure' | 'no';
export const BELIEFS: readonly Belief[] = ['yes', 'unsure', 'no'];

export type BeliefProfile = {
  intensity: Intensity;
  /** Lore notes: full = before every scan, medium = every second scan, light = first use of each tag. */
  priming: 'full' | 'medium' | 'light';
  /** Figure opacity band handed to placeGhost. */
  opacityRange: [number, number];
  /** Sceptics get more instrument telemetry on screen. */
  extraTelemetry: boolean;
};

export const BELIEF_PROFILE: Record<Belief, BeliefProfile> = {
  yes: { intensity: 'standard', priming: 'full', opacityRange: [0.08, 0.14], extraTelemetry: false },
  unsure: { intensity: 'standard', priming: 'medium', opacityRange: [0.11, 0.18], extraTelemetry: false },
  no: { intensity: 'brave', priming: 'light', opacityRange: [0.14, 0.22], extraTelemetry: true },
};

const KEY = 'fs4.belief.v1';

export function createBeliefStore(storage: KeyValueStore | null = webStorage()) {
  let belief: Belief | null | undefined;
  return {
    getBelief(): Belief | null {
      if (belief !== undefined) return belief;
      belief = null;
      try {
        const raw = storage?.getItem(KEY);
        if (raw && (BELIEFS as readonly string[]).includes(raw)) belief = raw as Belief;
      } catch {
        // memory only
      }
      return belief;
    },
    setBelief(b: Belief, apply: (i: Intensity) => void = setIntensity): BeliefProfile {
      belief = b;
      try {
        storage?.setItem(KEY, b);
      } catch {
        // memory only
      }
      apply(BELIEF_PROFILE[b].intensity);
      return BELIEF_PROFILE[b];
    },
  };
}

const store = createBeliefStore();
export const getBelief = store.getBelief;
export const setBelief = store.setBelief;
