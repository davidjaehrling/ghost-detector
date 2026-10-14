import { type Decision } from '../engine';
import { ensureConsent, interstitial } from '../ads';
import { track } from '../analytics';
import { sessionParam } from './interstitialParams';
import { SESSION_GAP_MS, cadenceStore } from '../state/cadence';

// Interstitial runtime (P5-05). The cadence machine (src/engine/adCadence.ts) decides; this file
// feeds it events and acts on `preload` and `show`. One clock source: cadenceStore.now (wall ms).
//
// A `show` decision does not display at once. The ad appears only when all of these hold:
//   - the viewfinder has rendered and is focused (`useInterstitialGate`, true only then);
//   - the camera permission is not being asked (the gate is false while the prompt is up);
//   - at least SHOW_DELAY_MS have passed since the tap on NEW SCAN.
// A show still waiting for the gate TAP_EXPIRY_MS after the tap is dropped; the ad stays at the natural break.
// If the ad did not load, nothing happens and the machine retries after its preload TTL.

export const SHOW_DELAY_MS = 500;
/** A pending show whose gate has not opened this long after the tap is dropped. */
export const TAP_EXPIRY_MS = 3000;

/** Pending show: the time of the tap that asked for it. */
let tapAt: number | null = null;
let gateOpen = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let leftAt: number | null = null;

function act(decision: Decision): void {
  if (!decision.preload) return;
  // The request waits for the consent check; with no consent nothing is requested.
  void ensureConsent().then(() => interstitial.load());
}

/** Cold start, once per process: appLaunch, the first session, and the foreground clock. */
export type AppStateLike = { addEventListener(type: 'change', listener: (state: string) => void): unknown };

export function startCadence(appState: AppStateLike, search = typeof window !== 'undefined' ? (window.location?.search ?? '') : ''): void {
  if (started) return;
  started = true;
  const forced = sessionParam(search);
  if (forced !== null) cadenceStore.setSessions(forced);
  act(cadenceStore.coldStart());
  appState.addEventListener('change', (state) => {
    if (state === 'background') {
      leftAt ??= cadenceStore.now();
    } else if (state === 'active') {
      // A resume is never a return to the viewfinder; it only counts as a session after the gap.
      if (leftAt !== null && cadenceStore.now() - leftAt > SESSION_GAP_MS) act(cadenceStore.beginSession());
      leftAt = null;
    }
  });
}

/** A fresh scan's result is up: `scanComplete`, then `resultShown`. */
export function onFreshResult(): void {
  act(cadenceStore.scanComplete());
  act(cadenceStore.resultShown());
}

/** A rewarded ad was displayed. */
export function onRewardedShown(): void {
  act(cadenceStore.rewardedShown());
}

/** The explicit tap from the result back to the viewfinder. */
export function onBackToViewfinder(): void {
  const d = cadenceStore.returnToViewfinder();
  act(d);
  if (!d.show) return;
  tapAt = cadenceStore.now();
  arm();
}

function arm(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (tapAt !== null && cadenceStore.now() - tapAt > TAP_EXPIRY_MS) tapAt = null;
  if (tapAt === null || !gateOpen) return;
  timer = setTimeout(() => void fire(), Math.max(0, tapAt + SHOW_DELAY_MS - cadenceStore.now()));
}

async function fire(): Promise<void> {
  timer = null;
  if (tapAt !== null && cadenceStore.now() - tapAt > TAP_EXPIRY_MS) tapAt = null;
  if (tapAt === null || !gateOpen) return;
  tapAt = null;
  const result = await interstitial.show();
  if (!result.shown) return;
  cadenceStore.interstitialShown();
  track('interstitial_shown');
}

/**
 * The viewfinder opens the gate once it has rendered, is focused and its camera permission is
 * settled, and closes it on a blur or while a permission prompt is up (`useInterstitialGate`).
 */
export function setGate(open: boolean): void {
  gateOpen = open;
  if (open) arm();
  else {
    if (timer) clearTimeout(timer);
    timer = null;
  }
}

/** Test hook. */
export function resetInterstitialRuntime(): void {
  tapAt = null;
  gateOpen = false;
  if (timer) clearTimeout(timer);
  timer = null;
  started = false;
  leftAt = null;
}
