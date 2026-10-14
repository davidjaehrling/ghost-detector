import { type Decision, type Event, type State, createCadence, reduce } from '../engine';
import { type KeyValueStore, webStorage } from './scans';

// Interstitial cadence store (P5-05). Holds two things across launches: the install's session
// counter and the cadence machine's state (src/engine/adCadence.ts, pure). Same storage approach as
// scans: memory, mirrored to localStorage where it exists. The machine has no clock; every event
// carries `atMs` from `now()`, which is wall-clock ms so a persisted last-show time still means
// something after a restart (the machine clamps a clock that went backwards).

const KEY = 'fs4.cadence.v1';

/** A return from the background after this long is a new session. */
export const SESSION_GAP_MS = 30 * 60 * 1000;

export type CadenceSnapshot = {
  /** Sessions begun so far on this install; the next session's 0-based index. */
  sessions: number;
  machine: State;
};

type Persisted = CadenceSnapshot;

function isState(v: unknown): v is State {
  const s = v as Partial<State> | null;
  return (
    !!s &&
    typeof s === 'object' &&
    !!s.config &&
    typeof s.sessionIndex === 'number' &&
    typeof s.scansSinceShow === 'number' &&
    typeof s.nowMs === 'number' &&
    (s.lastShowMs === null || typeof s.lastShowMs === 'number') &&
    (s.lastRewardedMs === null || typeof s.lastRewardedMs === 'number') &&
    (s.preloadAtMs === null || typeof s.preloadAtMs === 'number') &&
    typeof s.resultOpen === 'boolean'
  );
}

export function createCadenceStore(opts: { storage?: KeyValueStore | null; now?: () => number } = {}) {
  const storage = opts.storage === undefined ? webStorage() : opts.storage;
  const now = opts.now ?? Date.now;
  let snap: Persisted | null = null;
  let current = -1;

  const load = (): Persisted => {
    if (snap) return snap;
    snap = { sessions: 0, machine: createCadence() };
    try {
      const raw: unknown = JSON.parse(storage?.getItem(KEY) ?? 'null');
      const r = raw as Partial<Persisted> | null;
      if (r && typeof r.sessions === 'number' && Number.isInteger(r.sessions) && r.sessions >= 0 && isState(r.machine)) {
        snap = { sessions: r.sessions, machine: r.machine };
      }
    } catch {
      // memory only
    }
    return snap;
  };
  const save = () => {
    try {
      storage?.setItem(KEY, JSON.stringify(snap));
    } catch {
      // memory only
    }
  };

  const dispatch = (event: Event): Decision => {
    const s = load();
    const out = reduce(s.machine, event);
    s.machine = out.state;
    save();
    return out.decision;
  };

  const beginSession = (): Decision => {
    const s = load();
    current = s.sessions;
    s.sessions += 1;
    return dispatch({ type: 'sessionStart', atMs: now(), sessionIndex: current });
  };

  return {
    now,
    snapshot: (): CadenceSnapshot => ({ ...load() }),
    /** 0-based index of the session in progress, -1 before the first `beginSession`. */
    sessionIndex: () => current,
    /** Test hook: forget everything held in memory (stored data is read again on the next call). */
    reset() {
      snap = null;
      current = -1;
    },
    /** Test and harness hook: the next session gets index `n`. */
    setSessions(n: number) {
      load().sessions = Math.max(0, Math.floor(n));
      save();
    },
    /** Starts a session: the counter becomes its index and moves on. Returns the decision of `sessionStart`. */
    beginSession,
    /** Cold start: `appLaunch`, then the first session. Either event may ask for the preload. */
    coldStart(): Decision {
      const launch = dispatch({ type: 'appLaunch', atMs: now() });
      const session = beginSession();
      return { preload: launch.preload || session.preload, show: false };
    },
    scanComplete: () => dispatch({ type: 'scanComplete', atMs: now() }),
    resultShown: () => dispatch({ type: 'resultShown', atMs: now() }),
    rewardedShown: () => dispatch({ type: 'rewardedShown', atMs: now() }),
    interstitialShown: () => dispatch({ type: 'interstitialShown', atMs: now() }),
    returnToViewfinder: () => dispatch({ type: 'returnToViewfinder', atMs: now() }),
  };
}

export type CadenceStore = ReturnType<typeof createCadenceStore>;

export const cadenceStore: CadenceStore = createCadenceStore();
