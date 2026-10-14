import {
  type Belief,
  type Intensity,
  type NotifyState,
  type PendingItem,
  type ScanSummary,
  type SentItem,
  WINDOW_END_MIN,
  WINDOW_START_MIN,
  applyIntensityChange,
  localMinuteOfDay,
  nextNotification,
} from '../engine';
import { catalogue } from './log';
import { type RelayStore, type ScheduleBackend, type TapData, relayOn } from './relay';
import type { KeyValueStore, ScanRecord } from './scans';

// Local notification scheduling (docs/p6-brief.md section 2, D-032). The engine (src/engine/notify.ts)
// decides what and when; this file feeds it the stores, keeps the pending list and the sent history,
// and diffs the plan against the platform. Items are local only, on the `Field log` channel, posted
// by the platform at the engine's fire time. Nothing is scheduled without a granted permission and
// the RELAY switch on.

const KEY = 'fs4.notify.v1';
const DAY_MS = 86_400_000;
const KEEP_SENT_MS = 30 * DAY_MS;
const MAX_CHAIN = 7;

/** One scheduled line. `sentAtMs` is its fire time, so a time after now means still pending. */
export type SentRecord = SentItem & { id: string };

export type PlanData = {
  installMs: number;
  lastAppOpenMs: number;
  /** Intensity and jump-scare switch as last reconciled, the `prev` of applyIntensityChange. */
  seen: { intensity: Intensity; jumpScaresOff: boolean };
  sent: SentRecord[];
};

export type PlanStore = ReturnType<typeof createPlanStore>;

export function createPlanStore(storage: KeyValueStore | null, initial: { nowMs: number; intensity: Intensity; jumpScaresOff: boolean }) {
  let data: PlanData | null = null;
  const save = () => {
    try {
      storage?.setItem(KEY, JSON.stringify(data));
    } catch {
      // memory only
    }
  };
  const load = (): PlanData => {
    if (data) return data;
    data = {
      installMs: initial.nowMs,
      lastAppOpenMs: initial.nowMs,
      seen: { intensity: initial.intensity, jumpScaresOff: initial.jumpScaresOff },
      sent: [],
    };
    let found = false;
    try {
      const raw: unknown = JSON.parse(storage?.getItem(KEY) ?? 'null');
      if (raw && typeof raw === 'object') {
        const r = raw as Partial<PlanData>;
        if (typeof r.installMs === 'number') data.installMs = r.installMs;
        if (typeof r.lastAppOpenMs === 'number') data.lastAppOpenMs = r.lastAppOpenMs;
        if (r.seen && (r.seen.intensity === 'calm' || r.seen.intensity === 'standard' || r.seen.intensity === 'brave')) {
          data.seen = { intensity: r.seen.intensity, jumpScaresOff: r.seen.jumpScaresOff === true };
        }
        if (Array.isArray(r.sent)) {
          data.sent = r.sent.filter((x): x is SentRecord => !!x && typeof x.id === 'string' && typeof x.sentAtMs === 'number' && typeof x.templateId === 'number');
        }
        found = true;
      }
    } catch {
      // memory only
    }
    if (!found) save();
    return data;
  };
  return {
    get: load,
    pending: (nowMs: number): SentRecord[] => load().sent.filter((x) => x.sentAtMs > nowMs),
    setInstallMs(ms: number) {
      load().installMs = ms;
      save();
    },
    touchOpen(nowMs: number) {
      load().lastAppOpenMs = nowMs;
      save();
    },
    setSeen(intensity: Intensity, jumpScaresOff: boolean) {
      load().seen = { intensity, jumpScaresOff };
      save();
    },
    add(rec: SentRecord) {
      const d = load();
      d.sent = [...d.sent.filter((x) => x.id !== rec.id), rec].filter((x) => x.sentAtMs > rec.sentAtMs - KEEP_SENT_MS);
      save();
    },
    remove(id: string) {
      const d = load();
      d.sent = d.sent.filter((x) => x.id !== id);
      save();
    },
    markOpened(id: string): boolean {
      const rec = load().sent.find((x) => x.id === id);
      if (!rec || rec.opened) return false;
      rec.opened = true;
      save();
      return true;
    },
  };
}

/* ---------- state builder ---------- */

export type BuildInput = {
  nowMs: number;
  utcOffsetMin: number;
  records: readonly ScanRecord[];
  intensity: Intensity;
  belief: Belief | null;
  jumpScaresOff: boolean;
  /** Sessions started, the current one included. */
  sessionCount: number;
  optedIn: boolean;
  plan: Pick<PlanData, 'installMs' | 'lastAppOpenMs' | 'sent'>;
};

/** The engine's NotifyState from the stores. */
export function buildNotifyState(i: BuildInput): NotifyState {
  const decodedClasses = new Set<string>();
  const cat = catalogue(i.records);
  const newClassCase = new Set<string>();
  for (const r of [...i.records].filter((x) => x.deepScanAt !== undefined).sort((a, b) => a.deepScanAt! - b.deepScanAt!)) {
    if (!decodedClasses.has(r.profile.class)) newClassCase.add(r.id);
    decodedClasses.add(r.profile.class);
  }
  const scans: ScanSummary[] = i.records.map((r) => ({
    caseId: Number(r.id),
    atMs: r.createdAt,
    tier: r.outcome.tier,
    spi: r.outcome.spi,
    decodedPct: r.profile.signatureDecodedPct,
    decoded: r.deepScanAt !== undefined,
    declined: r.declined === true,
    newClass: newClassCase.has(r.id),
    tags: r.tag ? [r.tag] : [],
  }));
  const earliest = i.records.reduce((m, r) => Math.min(m, r.createdAt), i.plan.installMs);
  return {
    intensity: i.intensity,
    belief: i.belief ?? 'unsure',
    jumpScaresOff: i.jumpScaresOff,
    sessionCount: i.sessionCount,
    optedIn: i.optedIn,
    installMs: earliest,
    lastAppOpenMs: i.plan.lastAppOpenMs,
    scans,
    loggedTags: i.records.flatMap((r) => (r.tag ? [r.tag] : [])),
    catalogueCount: cat.count,
    ...(cat.lastLoggedClass ? { lastLoggedClass: cat.lastLoggedClass } : {}),
    sent: i.plan.sent.map(({ templateId, caseId, sentAtMs, opened }) => ({ templateId, ...(caseId !== undefined ? { caseId } : {}), sentAtMs, opened })),
    nowMs: i.nowMs,
    utcOffsetMin: i.utcOffsetMin,
  };
}

/* ---------- reconcile ---------- */

export type Reason = 'open' | 'focus' | 'settings';

export type Deps = {
  relay: RelayStore;
  backend: Pick<ScheduleBackend, 'schedule' | 'cancel'>;
  plan: PlanStore;
  records: () => readonly ScanRecord[];
  intensity: () => Intensity;
  belief: () => Belief | null;
  jumpScaresOff: () => boolean;
  sessionCount: () => number;
  nowMs: () => number;
  /** Local offset from UTC in minutes at a moment (the device zone, DST included). */
  offsetAt: (ms: number) => number;
  /** A fresh seed for call number `n` at `nowMs`. */
  seed: (nowMs: number, n: number) => number;
  /** Re-reads the stored system permission (it may have been revoked in system settings). Run on app open. */
  refreshPermission?: () => Promise<void>;
};

const idFor = (fireAtMs: number) => `fl-${fireAtMs}`;

/** The promise kept to the user: a line posts between 18:00 and 22:00 on the device clock at that moment. */
export function inWindow(fireAtMs: number, offsetAt: (ms: number) => number): boolean {
  const m = localMinuteOfDay(fireAtMs, offsetAt(fireAtMs));
  return m >= WINDOW_START_MIN && m < WINDOW_END_MIN;
}

/**
 * Re-expresses an instant computed with `assumedOffsetMin` as the same local date and minute under
 * the offset of that night, so a DST change between now and the night never moves the local minute.
 */
export function atNightOffset(fireAtMs: number, assumedOffsetMin: number, offsetAt: (ms: number) => number): number {
  const local = fireAtMs + assumedOffsetMin * 60_000; // wall clock as if UTC
  let x = fireAtMs;
  for (let i = 0; i < 3; i++) x = local - offsetAt(x) * 60_000;
  return x;
}

function caseOpen(records: readonly ScanRecord[], caseId: number | undefined): boolean {
  const r = records.find((x) => Number(x.id) === caseId);
  return !!r && r.deepScanAt === undefined && r.declined !== true;
}

export async function reconcileNow(d: Deps, reason: Reason): Promise<void> {
  const nowMs = d.nowMs();
  if (reason === 'open') {
    d.plan.touchOpen(nowMs);
    await d.refreshPermission?.().catch(() => {});
  }
  const rs = d.relay.get();
  const intensity = d.intensity();
  const jumpScaresOff = d.jumpScaresOff();
  const seen = d.plan.get().seen;
  const cancel = async (id: string) => {
    d.plan.remove(id);
    await d.backend.cancel(id);
  };

  // RELAY off (or the permission gone): everything pending is cancelled.
  if (!relayOn(rs)) {
    for (const p of d.plan.pending(nowMs)) await cancel(p.id);
    d.plan.setSeen(intensity, jumpScaresOff);
    return;
  }

  const records = d.records();
  const build = (): NotifyState =>
    buildNotifyState({
      nowMs, utcOffsetMin: d.offsetAt(nowMs), records, intensity, belief: d.belief(), jumpScaresOff,
      sessionCount: d.sessionCount(), optedIn: true, plan: d.plan.get(),
    });

  // What the engine no longer allows after an intensity or jump-scare change.
  let state = build();
  const pending: PendingItem[] = d.plan.pending(nowMs).map((p) => ({ id: p.id, templateId: p.templateId, fireAtMs: p.sentAtMs }));
  const change = applyIntensityChange({ intensity: seen.intensity }, state, pending);
  const drop = new Set(change.cancelIds);
  // Also: a time-zone or DST change moved it out of the window, a stale device, or a case since resolved.
  for (const p of d.plan.pending(nowMs)) {
    const stale = p.sentAtMs - state.lastAppOpenMs >= 7 * DAY_MS;
    const moved = !inWindow(p.sentAtMs, d.offsetAt);
    const resolved = p.templateId === 4 && !caseOpen(records, p.caseId);
    if (stale || moved || resolved) drop.add(p.id);
  }
  for (const id of drop) await cancel(id);
  d.plan.setSeen(intensity, jumpScaresOff);

  // Schedule what the engine allows next, one call at a time with the item appended to `sent`.
  state = build();
  for (let n = 0; n < MAX_CHAIN; n++) {
    let next = nextNotification(state, d.seed(nowMs, n));
    // The engine reads one offset for the whole search. Put the fire instant at the same local
    // minute on its own night, using the offset in force that night (DST), and keep it only if it holds.
    if (next) {
      const fireAtMs = atNightOffset(next.fireAtMs, state.utcOffsetMin, d.offsetAt);
      next = fireAtMs > nowMs && inWindow(fireAtMs, d.offsetAt) ? { ...next, fireAtMs } : null;
    }
    if (!next) break;
    const rec: SentRecord = { id: idFor(next.fireAtMs), templateId: next.templateId, ...(next.caseId !== undefined ? { caseId: next.caseId } : {}), sentAtMs: next.fireAtMs, opened: false };
    await d.backend.schedule({ id: rec.id, templateId: next.templateId, fireAtMs: next.fireAtMs, title: next.title, body: next.body, ...(next.caseId !== undefined ? { caseId: next.caseId } : {}) });
    d.plan.add(rec);
    state = { ...state, sent: [...state.sent, { templateId: rec.templateId, ...(rec.caseId !== undefined ? { caseId: rec.caseId } : {}), sentAtMs: rec.sentAtMs, opened: false }] };
  }
}

/* ---------- tap ---------- */

export type TapRoute = { pathname: '/viewfinder' } | { pathname: '/result/[id]'; params: { id: string } };

/** A tap opens the case (template 4) or the viewfinder, and marks the line opened. Nothing else. */
export function handleTap(tap: TapData, plan: Pick<PlanStore, 'markOpened'>, records: readonly ScanRecord[]): TapRoute {
  plan.markOpened(tap.id);
  if (tap.templateId === 4 && tap.caseId !== undefined) {
    const rec = records.find((r) => Number(r.id) === tap.caseId);
    if (rec) return { pathname: '/result/[id]', params: { id: rec.id } };
  }
  return { pathname: '/viewfinder' };
}

