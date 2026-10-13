/**
 * Sound and haptic config (docs/sound-palette.md section 9). The audio code reads
 * only this; it has no literals of its own. `resolveConfig` clamps every value
 * that the psych brief limits, so a tuning change cannot break them.
 */
import type { Intensity } from '../engine/outcome';
import type { Tier } from '../engine/tiers';

export type { Intensity, Tier };

export const TIER_ORDER: readonly Tier[] = ['quiet', 'trace', 'active', 'strong', 'critical'];
export const INTENSITIES: readonly Intensity[] = ['calm', 'standard', 'brave'];

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
export type HapticKind = 'impact' | 'notification' | 'selection';
export type NotificationKind = 'success' | 'warning' | 'error';

export interface HapticStep {
  kind: HapticKind;
  /** impact style, or notification type for kind 'notification'. */
  style?: HapticStyle | NotificationKind;
  /** Start of this transient, ms after the event. */
  atMs: number;
}
export type HapticEvent =
  | 'needleTick'
  | 'tierUp'
  | 'tierDown'
  | 'capture'
  | 'scanStart'
  | 'scanEnd'
  | 'criticalResult'
  | 'uiConfirm'
  | 'error'
  | 'scare';

export interface SoundConfig {
  sampleRate: 48000;
  /** Hard sample-peak ceiling, never above -6. */
  masterCeilingDbfs: number;
  geiger: {
    ratePerSec: Record<Tier, Record<Intensity, number>>;
    wobblePct: Record<Tier, number>;
    clickMs: [min: number, max: number];
    refractoryMs: number;
    levelDbfs: [floor: number, max: number];
    /** Bandpass edges of the click noise. */
    bandHz: [low: number, high: number];
    scatterDb: number;
    rateScatter: number;
    /** Viewfinder link: rate = base * (1 + k * |B - B0| / spanMg). */
    fluxK: number;
    fluxSpanMg: number;
    graticuleMg: number;
    overshootBurst: { clicks: number; rateMul: number };
  };
  hum: {
    f0ByRegion: Record<string, 50 | 60>;
    defaultF0: 50 | 60;
    harmonics: { mul: number; db: number }[];
    detuneHz: number;
    driftHz: number;
    tremoloHz: number;
    tremoloDb: number;
    levelDbfs: [min: number, max: number];
    lowpassHz: [closed: number, open: number];
  };
  static: {
    levelDbfs: Record<Tier, number>;
    centreHz: Record<Tier, number>;
    q: Record<Tier, number>;
    lfoHz: [min: number, max: number];
    lfoDepth: number;
  };
  breakthrough: {
    atProgress: number;
    openQ: number;
    openDb: number;
    openMs: number;
    narrowHz: number;
    narrowQ: number;
    durationMs: number;
    smearHz: [number, number];
    smearDbfs: number;
    smearMs: number;
    secondPassAt: number;
  };
  scare: {
    durationMs: number;
    peakDbfs: number;
    reducedPeakDbfs: number;
    attackMs: number;
    holdMs: number;
    floorDb: number;
    sweepHz: [from: number, to: number];
    sweepMs: number;
    sweepDb: number;
    highpassHz: number;
    bits: number;
    flashAtMs: number[];
    flashMs: number;
    windowStart: number;
    windowEnd: number;
  };
  holdMs: number;
  /** Cues around the hold and the reveal. */
  cues: {
    duckMs: number;
    thumpHz: number;
    thumpMs: number;
    thumpDbfs: number;
    relayDbfs: number;
    keyTickDbfs: number;
    returnMs: number;
    faultDropoutMs: number;
    fadeInMs: number;
  };
  haptics: Record<HapticEvent, HapticStep[]>;
  accessibility: { reducedFlash: boolean; maxTicksPerSec: number; reducedMaxTicksPerSec: number; tickGeigerCutoff: number };
}

/**
 * Android notification-type haptic durations, ms (palette section 7: about 60, 60, 80).
 * ESTIMATES, not measurements: they need a phone measurement at Phone check 2.
 */
export const ANDROID_NOTIFICATION_MS = { success: 60, warning: 60, error: 80 } as const;

/** Estimated transient length per haptic step, ms (palette section 7). */
export const HAPTIC_STEP_MS = {
  light: 10,
  medium: 15,
  heavy: 20,
  rigid: 12,
  soft: 10,
  selection: 8,
  success: ANDROID_NOTIFICATION_MS.success,
  warning: ANDROID_NOTIFICATION_MS.warning,
  error: ANDROID_NOTIFICATION_MS.error,
} as const;

export const MAX_HAPTIC_MS = 120;
export const SCARE_MS_RANGE = [400, 600] as const;
export const SCARE_PEAK_MAX_DBFS = -6;
export const CEILING_MAX_DBFS = -6;
export const MAX_FLASHES_PER_SEC = 3;
export const HOLD_MIN_MS = 1000;

export function stepMs(s: HapticStep): number {
  if (s.kind === 'selection') return HAPTIC_STEP_MS.selection;
  return HAPTIC_STEP_MS[(s.style ?? (s.kind === 'impact' ? 'light' : 'warning')) as keyof typeof HAPTIC_STEP_MS] ?? 10;
}
/** Total pattern length: the end of the last transient. */
export function patternMs(steps: readonly HapticStep[]): number {
  return steps.reduce((m, s) => Math.max(m, s.atMs + stepMs(s)), 0);
}

export const DEFAULT_CONFIG: SoundConfig = {
  sampleRate: 48000,
  masterCeilingDbfs: -6,
  geiger: {
    ratePerSec: {
      quiet: { calm: 0.5, standard: 0.8, brave: 1.0 },
      trace: { calm: 1.5, standard: 2.5, brave: 3.5 },
      active: { calm: 3, standard: 6, brave: 9 },
      strong: { calm: 5, standard: 10, brave: 16 },
      critical: { calm: 6, standard: 14, brave: 22 },
    },
    wobblePct: { quiet: 0.4, trace: 0.3, active: 0.2, strong: 0.15, critical: 0.1 },
    clickMs: [1, 3],
    refractoryMs: 12,
    levelDbfs: [-30, -12],
    bandHz: [1500, 6000],
    scatterDb: 3,
    rateScatter: 0.12,
    fluxK: 2,
    fluxSpanMg: 300,
    graticuleMg: 25,
    overshootBurst: { clicks: 3, rateMul: 2 },
  },
  hum: {
    f0ByRegion: {
      US: 60, CA: 60, MX: 60, BR: 60, CO: 60, VE: 60, PE: 60, EC: 60, GT: 60, CU: 60, DO: 60, HN: 60,
      SV: 60, NI: 60, PA: 60, PR: 60, CR: 60, KR: 60, TW: 60, PH: 60,
    },
    defaultF0: 50,
    harmonics: [
      { mul: 1, db: 0 },
      { mul: 2, db: -6 },
      { mul: 3, db: -10 },
      { mul: 5, db: -16 },
    ],
    detuneHz: 0.3,
    driftHz: 0.07,
    tremoloHz: 0.9,
    tremoloDb: 1.5,
    levelDbfs: [-48, -26],
    lowpassHz: [400, 2000],
  },
  static: {
    levelDbfs: { quiet: -54, trace: -46, active: -38, strong: -28, critical: -22 },
    centreHz: { quiet: 1800, trace: 2200, active: 2600, strong: 3000, critical: 3400 },
    q: { quiet: 0.7, trace: 0.8, active: 1.0, strong: 1.4, critical: 1.8 },
    lfoHz: [0.3, 1.1],
    lfoDepth: 0.15,
  },
  breakthrough: {
    atProgress: 0.55,
    openQ: 0.5,
    openDb: 6,
    openMs: 250,
    narrowHz: 1200,
    narrowQ: 6,
    durationMs: 400,
    smearHz: [300, 310],
    smearDbfs: -34,
    smearMs: 3000,
    secondPassAt: 0.8,
  },
  scare: {
    durationMs: 500,
    peakDbfs: -6,
    reducedPeakDbfs: -12,
    attackMs: 8,
    holdMs: 90,
    floorDb: -40,
    sweepHz: [900, 140],
    sweepMs: 350,
    sweepDb: -12,
    highpassHz: 600,
    bits: 8,
    flashAtMs: [0, 260],
    flashMs: 70,
    windowStart: 0.7,
    windowEnd: 0.9,
  },
  holdMs: 1200,
  cues: {
    duckMs: 15,
    thumpHz: 80,
    thumpMs: 12,
    thumpDbfs: -14,
    relayDbfs: -20,
    keyTickDbfs: -30,
    returnMs: 600,
    faultDropoutMs: 250,
    fadeInMs: 400,
  },
  haptics: {
    needleTick: [{ kind: 'impact', style: 'light', atMs: 0 }],
    tierUp: [{ kind: 'impact', style: 'medium', atMs: 0 }],
    tierDown: [{ kind: 'impact', style: 'light', atMs: 0 }],
    capture: [{ kind: 'impact', style: 'rigid', atMs: 0 }],
    scanStart: [
      { kind: 'impact', style: 'medium', atMs: 0 },
      { kind: 'impact', style: 'light', atMs: 60 },
    ],
    scanEnd: [{ kind: 'impact', style: 'heavy', atMs: 0 }],
    criticalResult: [{ kind: 'notification', style: 'warning', atMs: 0 }],
    uiConfirm: [{ kind: 'selection', atMs: 0 }],
    error: [{ kind: 'notification', style: 'error', atMs: 0 }],
    scare: [
      { kind: 'impact', style: 'heavy', atMs: 0 },
      { kind: 'impact', style: 'rigid', atMs: 80 },
    ],
  },
  accessibility: { reducedFlash: false, maxTicksPerSec: 8, reducedMaxTicksPerSec: 4, tickGeigerCutoff: 12 },
};

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function merge<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return base;
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(over as object)) out[k] = merge((base as Record<string, unknown>)[k], (over as Record<string, unknown>)[k]);
  return out as T;
}

/** Keep at most MAX_FLASHES_PER_SEC flashes inside any 1 s window (first ones win). */
export function clampFlashes(at: readonly number[]): number[] {
  const out: number[] = [];
  for (const t of [...at].filter((x) => x >= 0).sort((a, b) => a - b)) {
    if (out.filter((u) => t - u < 1000).length < MAX_FLASHES_PER_SEC) out.push(t);
  }
  return out;
}

/** Drop any transient that would end after MAX_HAPTIC_MS. */
export function clampPattern(steps: readonly HapticStep[]): HapticStep[] {
  return steps.filter((s) => s.atMs >= 0 && s.atMs + stepMs(s) <= MAX_HAPTIC_MS).sort((a, b) => a.atMs - b.atMs);
}

export function resolveConfig(overrides?: DeepPartial<SoundConfig>): SoundConfig {
  const c = merge(DEFAULT_CONFIG, overrides);
  c.masterCeilingDbfs = Math.min(c.masterCeilingDbfs, CEILING_MAX_DBFS);
  c.holdMs = Math.max(c.holdMs, HOLD_MIN_MS);
  c.scare.durationMs = clamp(c.scare.durationMs, SCARE_MS_RANGE[0], SCARE_MS_RANGE[1]);
  c.scare.peakDbfs = Math.min(c.scare.peakDbfs, SCARE_PEAK_MAX_DBFS, c.masterCeilingDbfs);
  c.scare.reducedPeakDbfs = Math.min(c.scare.reducedPeakDbfs, c.scare.peakDbfs);
  c.scare.flashAtMs = clampFlashes(c.scare.flashAtMs);
  c.scare.windowStart = clamp(c.scare.windowStart, 0, 1);
  c.scare.windowEnd = clamp(c.scare.windowEnd, c.scare.windowStart, 1);
  c.geiger.refractoryMs = Math.max(c.geiger.refractoryMs, 12);
  c.geiger.clickMs = [clamp(c.geiger.clickMs[0], 1, 3), clamp(c.geiger.clickMs[1], 1, 3)];
  if (c.geiger.clickMs[0] > c.geiger.clickMs[1]) c.geiger.clickMs = [c.geiger.clickMs[1], c.geiger.clickMs[1]];
  for (const e of Object.keys(c.haptics) as HapticEvent[]) c.haptics[e] = clampPattern(c.haptics[e]);
  return c;
}

/** Hum fundamental for an ISO region code (palette section 3). */
export function humF0(cfg: SoundConfig, region?: string): 50 | 60 {
  return (region ? cfg.hum.f0ByRegion[region.toUpperCase()] : undefined) ?? cfg.hum.defaultF0;
}

export const dbToLin = (db: number) => Math.pow(10, db / 20);
export const linToDb = (lin: number) => 20 * Math.log10(Math.max(lin, 1e-9));

/** 0 for QUIET up to 1 for CRITICAL. */
export const tierFrac = (t: Tier) => TIER_ORDER.indexOf(t) / (TIER_ORDER.length - 1);
