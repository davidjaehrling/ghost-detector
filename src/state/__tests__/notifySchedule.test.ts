import { describe, expect, it } from 'vitest';
import { type Intensity, type Outcome, type Tier, localDayNumber, localMinuteOfDay } from '../../engine';
import {
  type Deps,
  buildNotifyState,
  createPlanStore,
  handleTap,
  inWindow,
  reconcileNow,
} from '../notifySchedule';
import { catalogue } from '../log';
import { type ScheduledLine, createRelayStore } from '../relay';
import type { KeyValueStore, ScanRecord } from '../scans';

const mem = (): KeyValueStore => {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
const at = (d: number, h: number, m = 0) => new Date(Date.UTC(2026, 9, d, h, m)).getTime();
const DAY = 86_400_000;

const rec = (id: string, tag: string | undefined, tier: Tier, createdAt: number, over: Partial<ScanRecord> = {}, pct = 58, cls = 'RESIDUAL'): ScanRecord => ({
  id,
  createdAt,
  photoUri: 'p',
  seed: 1,
  ...(tag ? { tag } : {}),
  outcome: { tier, spi: 50, figureShown: false, smudge: false, jumpScare: false, scanDurationMs: 7000 } as Outcome,
  profile: { class: cls, era: 'e', name: `n${id}`, traits: [], signatureDecodedPct: pct },
  ...over,
});

const records = [
  rec('0001', 'cellar', 'quiet', at(9, 20), {}, 10),
  rec('0002', 'cellar', 'active', at(10, 21), {}, 58, 'RESIDUAL'),
  rec('0003', 'attic', 'strong', at(11, 21), { declined: true }, 60),
  rec('0004', undefined, 'strong', at(12, 21), { deepScanAt: at(12, 22) }, 70, 'SHADE'),
  rec('0005', 'attic', 'active', at(12, 23), { deepScanAt: at(13, 1) }, 66, 'SHADE'),
];

describe('buildNotifyState: fields from the stores', () => {
  const state = buildNotifyState({
    nowMs: at(13, 12),
    utcOffsetMin: 120,
    records,
    intensity: 'brave',
    belief: 'no',
    jumpScaresOff: true,
    sessionCount: 3,
    optedIn: true,
    plan: { installMs: at(12, 12), lastAppOpenMs: at(13, 11), sent: [{ id: 'fl-1', templateId: 2, sentAtMs: at(13, 18), opened: false }] },
  });
  it('carries intensity, belief, switches, sessions, opt-in, clock and offset', () => {
    expect(state).toMatchObject({ intensity: 'brave', belief: 'no', jumpScaresOff: true, sessionCount: 3, optedIn: true, nowMs: at(13, 12), utcOffsetMin: 120, lastAppOpenMs: at(13, 11) });
  });
  it('maps scans with declined, decoded, class novelty and tags', () => {
    const by = Object.fromEntries(state.scans.map((s) => [s.caseId, s]));
    expect(by[3]).toMatchObject({ declined: true, decoded: false, decodedPct: 60, tags: ['attic'], tier: 'strong' });
    expect(by[4]).toMatchObject({ decoded: true, newClass: true, tags: [] });
    expect(by[5]).toMatchObject({ decoded: true, newClass: false });
    expect(by[1]).toMatchObject({ declined: false, decoded: false, caseId: 1, atMs: at(9, 20) });
  });
  it('lists one logged tag per tagged case and counts decoded classes', () => {
    expect(state.loggedTags).toEqual(['cellar', 'cellar', 'attic', 'attic']);
    expect(state.catalogueCount).toBe(1);
  });
  it('feeds template 5 from the catalogue: the count and the class logged last', () => {
    expect(state.catalogueCount).toBe(catalogue(records).count);
    expect(state.lastLoggedClass).toBe('Shade');
    const none = buildNotifyState({ nowMs: 1, utcOffsetMin: 0, records: [rec('0001', 'cellar', 'quiet', at(9, 20))], intensity: 'standard', belief: null, jumpScaresOff: false, sessionCount: 1, optedIn: true, plan: { installMs: 1, lastAppOpenMs: 1, sent: [] } });
    expect(none.catalogueCount).toBe(0);
    expect('lastLoggedClass' in none).toBe(false);
  });
  it('carries the sent history without ids and takes the earliest of install and first scan', () => {
    expect(state.sent).toEqual([{ templateId: 2, sentAtMs: at(13, 18), opened: false }]);
    expect(state.installMs).toBe(at(9, 20));
  });
  it('defaults belief to unsure', () => {
    const s = buildNotifyState({ nowMs: 1, utcOffsetMin: 0, records: [], intensity: 'standard', belief: null, jumpScaresOff: false, sessionCount: 2, optedIn: true, plan: { installMs: 1, lastAppOpenMs: 1, sent: [] } });
    expect(s.belief).toBe('unsure');
  });
});

/* ---------- reconcile ---------- */

type Log = { call: 'schedule' | 'cancel'; id: string; line?: ScheduledLine };

function harness(over: Partial<Deps> & { zone?: (ms: number) => number; start?: { intensity?: Intensity; granted?: boolean; on?: boolean } } = {}) {
  const log: Log[] = [];
  const relay = createRelayStore(mem());
  const st = over.start ?? {};
  if (st.granted !== false) relay.setSystem('granted');
  else relay.setSystem('denied');
  if (st.on !== false) relay.setEnabled(true);
  let intensity: Intensity = st.intensity ?? 'standard';
  let jumpOff = false;
  let now = at(13, 10); // 12:00 at UTC+2
  const zone = over.zone ?? (() => 120);
  const plan = createPlanStore(mem(), { nowMs: now - 3 * DAY, intensity, jumpScaresOff: jumpOff });
  plan.touchOpen(now);
  const deps: Deps = {
    relay,
    backend: {
      async schedule(line) {
        log.push({ call: 'schedule', id: line.id, line });
      },
      async cancel(id) {
        log.push({ call: 'cancel', id });
      },
    },
    plan,
    records: () => records,
    intensity: () => intensity,
    belief: () => 'yes',
    jumpScaresOff: () => jumpOff,
    sessionCount: () => 2,
    nowMs: () => now,
    offsetAt: zone,
    seed: (n, k) => n + k * 7919,
    ...over,
  };
  return {
    deps, log, relay, plan,
    setIntensity: (i: Intensity) => void (intensity = i),
    setJumpOff: (v: boolean) => void (jumpOff = v),
    setNow: (n: number) => void (now = n),
  };
}

const scheduled = (log: Log[]) => log.filter((l) => l.call === 'schedule').map((l) => l.line!);

describe('reconcile', () => {
  it('schedules inside 18:00 to 22:00 local, with a FIELD LOG title, and records them as pending', async () => {
    const h = harness();
    await reconcileNow(h.deps, 'open');
    const lines = scheduled(h.log);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    for (const l of lines) {
      const m = localMinuteOfDay(l.fireAtMs, 120);
      expect(m).toBeGreaterThanOrEqual(18 * 60);
      expect(m).toBeLessThan(22 * 60);
      expect(l.title.startsWith('FIELD LOG')).toBe(true);
    }
    expect(h.plan.pending(at(13, 10)).map((p) => p.id).sort()).toEqual(lines.map((l) => l.id).sort());
    expect(h.plan.pending(at(13, 10)).every((p) => !p.opened)).toBe(true);
  });

  it('is a no-op the second time (no churn)', async () => {
    const h = harness();
    await reconcileNow(h.deps, 'open');
    const n = h.log.length;
    await reconcileNow(h.deps, 'focus');
    expect(h.log.length).toBe(n);
  });

  it('schedules nothing without the switch or without a granted permission', async () => {
    const off = harness({ start: { on: false } });
    await reconcileNow(off.deps, 'open');
    expect(off.log).toEqual([]);
    const denied = harness({ start: { granted: false } });
    await reconcileNow(denied.deps, 'open');
    expect(denied.log).toEqual([]);
  });

  it('cancels everything pending when RELAY goes off', async () => {
    const h = harness();
    await reconcileNow(h.deps, 'open');
    const ids = scheduled(h.log).map((l) => l.id);
    h.relay.setEnabled(false);
    h.log.length = 0;
    await reconcileNow(h.deps, 'settings');
    expect(h.log.map((l) => [l.call, l.id])).toEqual(ids.map((id) => ['cancel', id]));
    expect(h.plan.pending(at(13, 10))).toEqual([]);
  });

  it('on a switch to Calm cancels the pending items, then schedules from the Calm set', async () => {
    const h = harness({ start: { intensity: 'brave' } });
    await reconcileNow(h.deps, 'open');
    const first = scheduled(h.log).map((l) => l.id);
    h.log.length = 0;
    h.setIntensity('calm');
    await reconcileNow(h.deps, 'settings');
    const calls = h.log.map((l) => l.call);
    expect(calls.slice(0, first.length)).toEqual(first.map(() => 'cancel'));
    const after = scheduled(h.log);
    expect(after.length).toBe(1); // Calm cap
    expect(calls.indexOf('schedule')).toBeGreaterThan(calls.lastIndexOf('cancel'));
  });

  it('drops a pending line the jump-scare switch no longer allows', async () => {
    const h = harness({ start: { intensity: 'standard' } });
    await reconcileNow(h.deps, 'open');
    expect(scheduled(h.log).length).toBe(2);
    h.log.length = 0;
    h.setJumpOff(true);
    await reconcileNow(h.deps, 'settings');
    expect(h.log.filter((l) => l.call === 'cancel').length).toBe(1);
    expect(h.plan.pending(at(13, 10)).length).toBe(1);
  });

  it('stops scheduling once the app has not been opened for seven days', async () => {
    const h = harness();
    h.plan.touchOpen(at(13, 10) - 8 * DAY);
    await reconcileNow(h.deps, 'focus');
    expect(scheduled(h.log)).toEqual([]);
  });

  it('touches lastAppOpenMs on open only', async () => {
    const h = harness();
    h.plan.touchOpen(1);
    await reconcileNow(h.deps, 'focus');
    expect(h.plan.get().lastAppOpenMs).toBe(1);
    await reconcileNow(h.deps, 'open');
    expect(h.plan.get().lastAppOpenMs).toBe(at(13, 10));
  });
});

/* ---------- the 18:00 to 22:00 promise ---------- */

describe('the 18:00 to 22:00 promise', () => {
  // DST: Europe/Berlin leaves summer time on 2026-10-25 01:00 UTC (UTC+2 to UTC+1).
  const dstAt = Date.UTC(2026, 9, 25, 1);
  const berlin = (ms: number) => (ms < dstAt ? 120 : 60);

  it('holds for every night across a DST change', async () => {
    for (let startDay = 18; startDay <= 27; startDay++) {
      const h = harness({ zone: berlin, start: { intensity: 'brave' } });
      h.setNow(at(startDay, 10));
      h.plan.touchOpen(at(startDay, 10));
      await reconcileNow(h.deps, 'open');
      for (const l of scheduled(h.log)) {
        expect(inWindow(l.fireAtMs, berlin), `start ${startDay}, fire ${new Date(l.fireAtMs).toISOString()}`).toBe(true);
        const m = localMinuteOfDay(l.fireAtMs, berlin(l.fireAtMs));
        expect(m).toBeGreaterThanOrEqual(1080);
        expect(m).toBeLessThan(1320);
      }
    }
  });

  it('holds for the time zones from UTC-12 to UTC+14 on the first night', async () => {
    for (const off of [-720, -300, 0, 60, 330, 345, 540, 840]) {
      const h = harness({ zone: () => off, start: { intensity: 'brave' } });
      await reconcileNow(h.deps, 'open');
      const lines = scheduled(h.log);
      expect(lines.length, `offset ${off}`).toBeGreaterThan(0);
      for (const l of lines) {
        const m = localMinuteOfDay(l.fireAtMs, off);
        expect(m).toBeGreaterThanOrEqual(1080);
        expect(m).toBeLessThan(1320);
      }
      const days = lines.map((l) => localDayNumber(l.fireAtMs, off));
      expect(new Set(days).size).toBe(days.length); // one per local night
    }
  });

  it('after a time-zone change the old lines are cancelled and new ones land in the new window', async () => {
    let zone = 60;
    const h = harness({ zone: () => zone });
    await reconcileNow(h.deps, 'open');
    const old = scheduled(h.log).map((l) => l.id);
    expect(old.length).toBeGreaterThan(0);
    zone = -300; // the device flew west
    h.log.length = 0;
    await reconcileNow(h.deps, 'open');
    expect(h.log.filter((l) => l.call === 'cancel').map((l) => l.id).sort()).toEqual([...old].sort());
    const fresh = scheduled(h.log);
    expect(fresh.length).toBeGreaterThan(0);
    for (const l of fresh) expect(inWindow(l.fireAtMs, () => zone)).toBe(true);
  });
});

/* ---------- tap ---------- */

describe('handleTap', () => {
  const plan = () => {
    const p = createPlanStore(mem(), { nowMs: 0, intensity: 'standard', jumpScaresOff: false });
    p.add({ id: 'fl-a', templateId: 4, caseId: 2, sentAtMs: at(13, 19), opened: false });
    p.add({ id: 'fl-b', templateId: 2, sentAtMs: at(14, 19), opened: false });
    return p;
  };
  it('template 4 opens the case and marks the line opened', () => {
    const p = plan();
    expect(handleTap({ id: 'fl-a', templateId: 4, caseId: 2 }, p, records)).toEqual({ pathname: '/result/[id]', params: { id: '0002' } });
    expect(p.get().sent.find((x) => x.id === 'fl-a')!.opened).toBe(true);
    expect(p.get().sent.find((x) => x.id === 'fl-b')!.opened).toBe(false);
  });
  it('every other template opens the viewfinder', () => {
    const p = plan();
    expect(handleTap({ id: 'fl-b', templateId: 2 }, p, records)).toEqual({ pathname: '/viewfinder' });
    expect(p.get().sent.find((x) => x.id === 'fl-b')!.opened).toBe(true);
  });
  it('a case that is gone falls back to the viewfinder', () => {
    expect(handleTap({ id: 'fl-a', templateId: 4, caseId: 99 }, plan(), records)).toEqual({ pathname: '/viewfinder' });
  });
});
