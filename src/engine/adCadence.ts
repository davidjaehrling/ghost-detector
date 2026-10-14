/**
 * Interstitial cadence state machine (plan section 8, P5-03).
 *
 * Pure and serialisable: no clock, no React, no native imports. Every event carries `atMs`, a
 * timestamp from one clock the app chooses (monotonic ms is best). The state is a plain object, so
 * the app can JSON-persist it across launches. See src/engine/README.md for how to feed it.
 *
 * Session index convention: 0-based. `sessionIndex` 0 is the first session of the install; the
 * app derives it from a persisted launch counter (the session store keeps none yet, see README).
 */

export const MIN_SCANS_BETWEEN = 2;
export const MIN_INTERVAL_MS = 180_000;
export const REWARDED_COOLDOWN_MS = 60_000;
/** A preload request goes stale after this long (AdMob interstitials expire after about 1 h). */
export const PRELOAD_TTL_MS = 3_600_000;

export interface CadenceConfig {
  minScansBetween: number;
  minIntervalMs: number;
  rewardedCooldownMs: number;
  preloadTtlMs: number;
}

export const DEFAULT_CONFIG: Readonly<CadenceConfig> = {
  minScansBetween: MIN_SCANS_BETWEEN,
  minIntervalMs: MIN_INTERVAL_MS,
  rewardedCooldownMs: REWARDED_COOLDOWN_MS,
  preloadTtlMs: PRELOAD_TTL_MS,
};

export type Event =
  | { type: 'appLaunch'; atMs: number }
  | { type: 'sessionStart'; atMs: number; sessionIndex: number }
  | { type: 'scanComplete'; atMs: number }
  | { type: 'resultShown'; atMs: number }
  | { type: 'returnToViewfinder'; atMs: number }
  | { type: 'rewardedShown'; atMs: number }
  | { type: 'interstitialShown'; atMs: number }
  | { type: 'tick'; atMs: number };

export interface State {
  config: CadenceConfig;
  /** 0 = first session of the install. Unknown defaults to 0, which never shows. */
  sessionIndex: number;
  /** scanComplete events since the last show (since install before the first show). */
  scansSinceShow: number;
  lastShowMs: number | null;
  lastRewardedMs: number | null;
  /** Latest timestamp seen. */
  nowMs: number;
  /** When the outstanding preload was requested; null = none outstanding. */
  preloadAtMs: number | null;
  /** A result is on screen and has not been left yet. */
  resultOpen: boolean;
}

export interface Decision {
  preload: boolean;
  show: boolean;
}

export function createCadence(config: Partial<CadenceConfig> = {}): State {
  return {
    config: { ...DEFAULT_CONFIG, ...config },
    sessionIndex: 0,
    scansSinceShow: 0,
    lastShowMs: null,
    lastRewardedMs: null,
    nowMs: 0,
    preloadAtMs: null,
    resultOpen: false,
  };
}

const NO: Decision = { preload: false, show: false };

export function reduce(state: State, event: Event): { state: State; decision: Decision } {
  const s: State = { ...state };
  const cfg = s.config;
  const entryPreloadAt = state.preloadAtMs;

  if (event.type === 'appLaunch') {
    // A new process: any loaded ad object is gone. If the clock went backwards (a reboot reset a
    // monotonic clock), treat the last show and rewarded as "just now" so the gaps stay safe.
    if (event.atMs < s.nowMs) {
      if (s.lastShowMs !== null) s.lastShowMs = Math.min(s.lastShowMs, event.atMs);
      if (s.lastRewardedMs !== null) s.lastRewardedMs = Math.min(s.lastRewardedMs, event.atMs);
    }
    s.nowMs = event.atMs;
    s.preloadAtMs = null;
    s.resultOpen = false;
  } else {
    s.nowMs = Math.max(s.nowMs, event.atMs);
  }
  const now = s.nowMs;

  let show = false;
  switch (event.type) {
    case 'sessionStart':
      s.sessionIndex = event.sessionIndex;
      s.resultOpen = false;
      break;
    case 'scanComplete':
      s.scansSinceShow += 1;
      break;
    case 'resultShown':
      s.resultOpen = true;
      break;
    case 'rewardedShown':
      s.lastRewardedMs = now;
      break;
    case 'interstitialShown':
      s.lastShowMs = now;
      s.scansSinceShow = 0;
      s.preloadAtMs = null;
      break;
    case 'returnToViewfinder': {
      const cameFromResult = s.resultOpen;
      s.resultOpen = false;
      const preloaded = entryPreloadAt !== null && now - entryPreloadAt < cfg.preloadTtlMs;
      show =
        cameFromResult &&
        preloaded &&
        s.sessionIndex >= 1 &&
        s.scansSinceShow >= cfg.minScansBetween &&
        (s.lastShowMs === null || now - s.lastShowMs >= cfg.minIntervalMs) &&
        (s.lastRewardedMs === null || now - s.lastRewardedMs >= cfg.rewardedCooldownMs);
      break;
    }
    default:
      break;
  }

  if (show) {
    s.lastShowMs = now;
    s.scansSinceShow = 0;
    s.preloadAtMs = null;
    return { state: s, decision: { preload: false, show: true } };
  }

  // Preload as soon as the scan-count gate is open in a non-first session, once per ad: a new
  // request needs an intervening show, a launch, or the TTL to pass.
  const wantsPreload = s.sessionIndex >= 1 && s.scansSinceShow >= cfg.minScansBetween;
  const outstanding = s.preloadAtMs !== null && now - s.preloadAtMs < cfg.preloadTtlMs;
  if (wantsPreload && !outstanding) {
    s.preloadAtMs = now;
    return { state: s, decision: { preload: true, show: false } };
  }
  return { state: s, decision: NO };
}
