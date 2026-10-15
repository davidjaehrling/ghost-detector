/**
 * Haptic grammar (docs/sound-palette.md section 7) on expo-haptics. Short discrete
 * transients only, every pattern under 120 ms. Events fire from a reading or a user
 * action; the caller never fires them at random.
 */
import {
  DEFAULT_CONFIG,
  type HapticEvent,
  type HapticStep,
  type HapticStyle,
  type Intensity,
  type NotificationKind,
  type SoundConfig,
} from './config';
import { calmStyle } from './hapticStyle';

export { calmStyle };

/** The subset of expo-haptics used here, injectable for tests. */
export interface HapticDriver {
  impact(style: HapticStyle): void;
  notification(kind: NotificationKind): void;
  selection(): void;
}

export interface HapticsOptions {
  driver?: HapticDriver;
  now?: () => number;
  later?: (fn: () => void, ms: number) => void;
}

export interface Haptics {
  fire(event: HapticEvent): void;
  /** Master switch (Settings "Haptics"). Off means no call reaches the driver. */
  setEnabled(on: boolean): void;
  /** Reduce-motion: needle ticks capped at 4 per second. */
  setReduced(on: boolean): void;
  setIntensity(i: Intensity): void;
  /** Current Geiger rate; needle ticks drop above 12 per second. */
  setGeigerRate(r: number): void;
}

function expoDriver(): HapticDriver | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const H = require('expo-haptics') as typeof import('expo-haptics');
    const impact = { light: H.ImpactFeedbackStyle.Light, medium: H.ImpactFeedbackStyle.Medium, heavy: H.ImpactFeedbackStyle.Heavy, rigid: H.ImpactFeedbackStyle.Rigid, soft: H.ImpactFeedbackStyle.Soft };
    const note = { success: H.NotificationFeedbackType.Success, warning: H.NotificationFeedbackType.Warning, error: H.NotificationFeedbackType.Error };
    return {
      impact: (s) => void H.impactAsync(impact[s]).catch(() => undefined),
      notification: (k) => void H.notificationAsync(note[k]).catch(() => undefined),
      selection: () => void H.selectionAsync().catch(() => undefined),
    };
  } catch {
    return null;
  }
}

export function createHaptics(config: SoundConfig = DEFAULT_CONFIG, opts: HapticsOptions = {}): Haptics {
  const driver = opts.driver ?? expoDriver();
  const now = opts.now ?? (() => Date.now());
  const later = opts.later ?? ((fn, ms) => void setTimeout(fn, ms));
  let enabled = true;
  let reduced = config.accessibility.reducedFlash;
  let intensity: Intensity = 'standard';
  let geigerRate = 0;
  const ticks: number[] = [];

  const play = (s: HapticStep) => {
    if (!driver || !enabled) return;
    if (s.kind === 'selection') driver.selection();
    else if (s.kind === 'notification') driver.notification((s.style as NotificationKind) ?? 'warning');
    else driver.impact((calmStyle(s.style, intensity) as HapticStyle) ?? 'light');
  };

  return {
    fire(event) {
      if (!enabled || !driver) return;
      if (event === 'needleTick') {
        const limit = reduced ? config.accessibility.reducedMaxTicksPerSec : config.accessibility.maxTicksPerSec;
        const t = now();
        while (ticks.length && t - ticks[0]! >= 1000) ticks.shift();
        if (geigerRate > config.accessibility.tickGeigerCutoff || ticks.length >= limit) return;
        ticks.push(t);
      }
      for (const s of config.haptics[event]) {
        if (s.atMs <= 0) play(s);
        else later(() => play(s), s.atMs);
      }
    },
    setEnabled: (on) => {
      enabled = on;
    },
    setReduced: (on) => {
      reduced = on;
    },
    setIntensity: (i) => {
      intensity = i;
    },
    setGeigerRate: (r) => {
      geigerRate = r;
    },
  };
}
