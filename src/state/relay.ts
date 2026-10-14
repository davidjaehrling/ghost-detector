import { type KeyValueStore } from './scans';
import { platformStorage } from './storage';

// FIELD LOG RELAY (docs/p6-brief.md section 2.2, D-032). Three things live here: the trigger for the
// one opt-in module, the persisted opt-in state, and the permission flow behind FIT RELAY and the
// Settings row. Scheduling is the engine's (src/engine/notify.ts) and is not wired here.

export const FIELD_LOG_CHANNEL = 'field-log';

export type SystemPermission = 'unknown' | 'granted' | 'denied';

export type RelayState = {
  /** The module has been shown. It never shows twice, whatever the answer. */
  offered: boolean;
  /** The user's switch. In force only while the system permission is granted. */
  enabled: boolean;
  /** What the system last said. `denied` is never asked again from inside the app. */
  system: SystemPermission;
};

export const relayCopy = {
  header: 'FIELD LOG RELAY',
  body: 'Fit the relay? The unit posts at most one field-log line a night: the index, the moon or an open case. 18:00 to 22:00 only. Lines are simulated, like every reading.',
  fit: 'FIT RELAY',
  notNow: 'NOT NOW',
  fitted: 'Relay fitted. Change in Settings.',
  notFitted: 'Relay not fitted. Change in Settings.',
  settingsLabel: 'RELAY',
  blocked: 'RELAY BLOCKED BY SYSTEM. OPEN SYSTEM SETTINGS.',
} as const;

export type RelayContext = {
  state: RelayState;
  /** Completed scans on file. */
  scanCount: number;
  /** A STRONG (or higher) result is on file. */
  hasStrong: boolean;
  /** 0-based index of the session in progress; session 0 carries the calibration sticker. */
  sessionIndex: number;
  /** This is the return from a result to the viewfinder (never a cold start or a tab change). */
  fromResult: boolean;
  /** The interstitial runtime's decision for this return was `show`. */
  interstitial: boolean;
};

/** Whether the opt-in module shows on this return to the viewfinder. */
export function relayDue(c: RelayContext): boolean {
  if (c.state.offered) return false;
  if (!c.fromResult) return false;
  if (c.interstitial) return false; // waits for the next eligible return
  if (c.sessionIndex < 1) return false; // never with the first launch's calibration sticker
  return c.scanCount >= 3 || c.hasStrong;
}

/** The interstitial runtime's note about the latest return, read once by the viewfinder. */
export type ReturnNote = { interstitial: boolean };

export type NotifyBackend = {
  /** Creates the `Field log` channel. Must have run before the permission request. */
  ensureChannel(): Promise<void>;
  /** The system's current answer, without asking. */
  permission(): Promise<SystemPermission>;
  /** Shows the system dialog. Only ever called from a tap on FIT RELAY or on the Settings row. */
  request(): Promise<'granted' | 'denied'>;
  openSystemSettings(): Promise<void>;
};

const KEY = 'fs4.relay.v1';
const DEFAULT: RelayState = { offered: false, enabled: false, system: 'unknown' };

export function createRelayStore(storage: KeyValueStore | null = platformStorage()) {
  let state: RelayState | null = null;
  const listeners = new Set<() => void>();
  const load = (): RelayState => {
    if (state) return state;
    state = { ...DEFAULT };
    try {
      const raw: unknown = JSON.parse(storage?.getItem(KEY) ?? 'null');
      if (raw && typeof raw === 'object') {
        const r = raw as Record<string, unknown>;
        state = {
          offered: r.offered === true,
          enabled: r.enabled === true,
          system: r.system === 'granted' || r.system === 'denied' ? r.system : 'unknown',
        };
      }
    } catch {
      // memory only
    }
    return state;
  };
  const set = (patch: Partial<RelayState>) => {
    state = { ...load(), ...patch };
    try {
      storage?.setItem(KEY, JSON.stringify(state));
    } catch {
      // memory only
    }
    for (const l of listeners) l();
  };
  return {
    /** A stable object until something changes. */
    get: load,
    markOffered: () => set({ offered: true }),
    setEnabled: (enabled: boolean) => set({ enabled }),
    setSystem: (system: SystemPermission) => set({ system }),
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

export type RelayStore = ReturnType<typeof createRelayStore>;

/** The switch as the user sees it: on only with the permission granted. */
export const relayOn = (s: RelayState): boolean => s.enabled && s.system === 'granted';

/**
 * FIT RELAY. Creates the channel, then asks the system once. After a system denial it asks no more.
 * Resolves true when the relay is fitted (permission granted, switch on).
 */
export async function fitRelay(store: RelayStore, backend: NotifyBackend): Promise<boolean> {
  if (store.get().system === 'denied') return false;
  await backend.ensureChannel();
  const answer = await backend.request();
  store.setSystem(answer);
  store.setEnabled(answer === 'granted');
  return answer === 'granted';
}

/** Re-reads the system permission (it may have changed in system settings). */
export async function refreshRelay(store: RelayStore, backend: NotifyBackend): Promise<void> {
  const p = await backend.permission();
  if (p === 'granted' || p === 'denied') store.setSystem(p);
  if (store.get().system !== 'granted' && store.get().enabled) store.setEnabled(false);
}

/**
 * The RELAY row in Settings. On to off: just off. Off to on: with the permission granted just on;
 * after a system denial open the system notification settings (no second dialog); never asked
 * (NOT NOW) ask once through the same flow.
 */
export async function toggleRelay(store: RelayStore, backend: NotifyBackend): Promise<void> {
  const s = store.get();
  if (relayOn(s)) return store.setEnabled(false);
  if (s.system === 'granted') return store.setEnabled(true);
  if (s.system === 'denied') return backend.openSystemSettings();
  await fitRelay(store, backend);
}

const store = createRelayStore();
export const relayStore = store;
