import { readInstallSeed } from '../ui/boot/install';
import { getBelief } from './belief';
import { cadenceStore } from './cadence';
import { notifyBackend } from './notifyBackend';
import { type Deps, type PlanStore, type Reason, type TapRoute, createPlanStore, handleTap, reconcileNow } from './notifySchedule';
import { type ScheduleBackend, relayStore } from './relay';
import { type ScanRecord, getIntensity, listScans } from './scans';
import { getSettings } from './settings';
import { platformStorage } from './storage';

// The runtime wiring of the scheduler (notifySchedule.ts is pure): real stores, the platform
// backend, the device clock and zone, and the web harness params.

// Web harness: ?clock=<iso> fixes the scheduler's now (L2 only). Read once; the router drops the query.
const clockMs = (() => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location?.search ?? '').get('clock');
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
})();
const harnessNow = () => clockMs ?? Date.now();

const seedFor = (nowMs: number, n: number) => (readInstallSeed() ^ (Math.floor(nowMs / 1000) % 2 ** 31) ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;

let plan: PlanStore | null = null;
const defaultPlan = (): PlanStore =>
  (plan ??= createPlanStore(platformStorage(), { nowMs: harnessNow(), intensity: getIntensity(), jumpScaresOff: !getSettings().jumpScares }));

const defaultDeps = (): Deps => ({
  relay: relayStore,
  backend: notifyBackend,
  plan: defaultPlan(),
  records: listScans,
  intensity: getIntensity,
  belief: getBelief,
  jumpScaresOff: () => !getSettings().jumpScares,
  sessionCount: () => Math.max(0, cadenceStore.sessionIndex() + 1),
  nowMs: harnessNow,
  offsetAt: (ms) => -new Date(ms).getTimezoneOffset(),
  seed: seedFor,
});

let chain: Promise<void> = Promise.resolve();

/** Call on every app open, on return to the viewfinder and after a settings change. Never throws. */
export function syncRelay(reason: Reason, deps: Deps = defaultDeps()): Promise<void> {
  chain = chain.then(() => reconcileNow(deps, reason)).catch(() => {});
  return chain;
}

/** Subscribes to taps; `go` receives the route to open. Returns the unsubscribe. */
export function listenForTaps(go: (route: TapRoute) => void, backend: ScheduleBackend = notifyBackend, deps: { plan: PlanStore; records: () => readonly ScanRecord[] } = { plan: defaultPlan(), records: listScans }): () => void {
  return backend.onTap((tap) => go(handleTap(tap, deps.plan, deps.records())));
}

// Web harness: ?relay=on fits the relay at load, with the permission the ?notify= flag names.
if (typeof window !== 'undefined') {
  const q = new URLSearchParams(window.location?.search ?? '');
  const answer = q.get('notify');
  if (q.get('relay') === 'on' && (answer === 'granted' || answer === 'denied')) {
    relayStore.markOffered();
    relayStore.setSystem(answer);
    relayStore.setEnabled(true);
  }
}
