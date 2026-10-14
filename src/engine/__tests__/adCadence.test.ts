import { describe, expect, it } from 'vitest';
import {
  MIN_INTERVAL_MS, MIN_SCANS_BETWEEN, PRELOAD_TTL_MS, REWARDED_COOLDOWN_MS,
  createCadence, reduce, type Decision, type Event, type State,
} from '../adCadence';
import { mulberry32 } from '../rng';

const TYPES: Event['type'][] = [
  'appLaunch', 'sessionStart', 'scanComplete', 'resultShown', 'returnToViewfinder',
  'rewardedShown', 'interstitialShown', 'tick',
];
// Weighted toward the scan loop so shows actually happen.
const WEIGHTS = [1, 1, 5, 5, 5, 1, 0.5, 3];

interface Step { event: Event; decision: Decision; after: State }

function randomTrace(seed: number, len = 60): Step[] {
  const rnd = mulberry32(seed);
  const total = WEIGHTS.reduce((a, b) => a + b, 0);
  let t = Math.floor(rnd() * 1e6);
  let state = createCadence();
  const steps: Step[] = [];
  for (let i = 0; i < len; i++) {
    let r = rnd() * total;
    let k = 0;
    while (r >= WEIGHTS[k]!) r -= WEIGHTS[k++]!;
    const dt = [0, 1_000, 5_000, 30_000, 70_000, 200_000, 500_000][Math.floor(rnd() * 7)]!;
    t += Math.floor(rnd() * (dt + 1));
    const type = TYPES[k]!;
    if (type === 'appLaunch' && rnd() < 0.3) t = Math.floor(rnd() * 1e5); // clock reset (reboot)
    if (rnd() < 0.002) t += PRELOAD_TTL_MS; // let a preload go stale now and then
    const event: Event = type === 'sessionStart'
      ? { type, atMs: t, sessionIndex: [0, 1, 1, 2, 7][Math.floor(rnd() * 5)]! }
      : ({ type, atMs: t } as Event);
    const out = reduce(state, event);
    state = out.state;
    steps.push({ event, decision: out.decision, after: out.state });
  }
  return steps;
}

const N = 10_000;
const traces: Step[][] = Array.from({ length: N }, (_, i) => randomTrace(i + 1));

describe('constants', () => {
  it('pin the plan section 8 numbers', () => {
    expect(MIN_SCANS_BETWEEN).toBe(2);
    expect(MIN_INTERVAL_MS).toBe(180_000);
    expect(REWARDED_COOLDOWN_MS).toBe(60_000);
    expect(createCadence().config).toMatchObject({
      minScansBetween: 2, minIntervalMs: 180_000, rewardedCooldownMs: 60_000,
    });
  });
});

describe('example flow', () => {
  const run = (events: Event[]) => {
    let s = createCadence();
    const out: Decision[] = [];
    for (const e of events) { const r = reduce(s, e); s = r.state; out.push(r.decision); }
    return { s, out };
  };
  const scan = (t: number): Event[] => [
    { type: 'scanComplete', atMs: t }, { type: 'resultShown', atMs: t + 1000 },
    { type: 'returnToViewfinder', atMs: t + 20_000 },
  ];

  it('stays silent in session 0, then preloads on the second scan and shows on the return', () => {
    const first = run([
      { type: 'appLaunch', atMs: 0 }, { type: 'sessionStart', atMs: 1, sessionIndex: 0 },
      ...scan(1000), ...scan(100_000), ...scan(300_000),
    ]);
    expect(first.out.some((d) => d.show || d.preload)).toBe(false);

    const second = run([
      { type: 'appLaunch', atMs: 0 }, { type: 'sessionStart', atMs: 1, sessionIndex: 1 },
      ...scan(1000), ...scan(100_000),
    ]);
    // events: launch, start, scan, result, return, scan, result, return
    expect(second.out.map((d) => d.show)).toEqual([false, false, false, false, false, false, false, true]);
    expect(second.out.map((d) => d.preload)).toEqual([false, false, false, false, false, true, false, false]);
  });

  it('blocks the show inside 180 s of the last one and inside 60 s of a rewarded ad', () => {
    const base: Event[] = [
      { type: 'appLaunch', atMs: 0 }, { type: 'sessionStart', atMs: 1, sessionIndex: 3 },
      ...scan(1000), ...scan(30_000), // show at 50_000
    ];
    const afterShow = run(base);
    expect(afterShow.out.at(-1)!.show).toBe(true);
    const tooSoon = run([...base, ...scan(60_000), ...scan(90_000)]); // return at 110_000
    expect(tooSoon.out.at(-1)!.show).toBe(false);
    const later = run([...base, ...scan(60_000), ...scan(240_000)]); // return at 260_000
    expect(later.out.at(-1)!.show).toBe(true);
    const rewarded = run([...base, ...scan(60_000), { type: 'rewardedShown', atMs: 235_000 }, ...scan(240_000)]);
    expect(rewarded.out.at(-1)!.show).toBe(false);
  });

  it('survives a JSON round trip', () => {
    const s = traces[5]!.at(-1)!.after;
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('property tests (10,000 random sequences)', () => {
  it('generator reaches shows, preloads and blocked returns (not vacuous)', () => {
    let shows = 0, preloads = 0, blocked = 0;
    for (const tr of traces) for (const st of tr) {
      if (st.decision.show) shows++;
      if (st.decision.preload) preloads++;
      if (st.event.type === 'returnToViewfinder' && !st.decision.show) blocked++;
    }
    expect(shows).toBeGreaterThan(2000);
    expect(preloads).toBeGreaterThan(2000);
    expect(blocked).toBeGreaterThan(2000);
  });

  it('never shows in the first session (sessionIndex 0)', () => {
    for (const tr of traces) {
      let idx = 0;
      for (const { event, decision } of tr) {
        if (event.type === 'sessionStart') idx = event.sessionIndex;
        if (decision.show) expect(idx).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('never shows on appLaunch, sessionStart, scanComplete, resultShown, rewardedShown (show only on returnToViewfinder)', () => {
    for (const tr of traces) for (const { event, decision } of tr) {
      if (event.type !== 'returnToViewfinder') expect(decision.show).toBe(false);
    }
  });

  it('shows only after a result was on screen', () => {
    for (const tr of traces) {
      let open = false;
      for (const { event, decision } of tr) {
        const was = open;
        if (event.type === 'resultShown') open = true;
        else if (event.type === 'returnToViewfinder' || event.type === 'sessionStart' || event.type === 'appLaunch') open = false;
        if (decision.show) expect(was).toBe(true);
      }
    }
  });

  it('shows at most once per 2 completed scans (counted from install for the first)', () => {
    for (const tr of traces) {
      let scans = 0;
      for (const { event, decision } of tr) {
        if (event.type === 'scanComplete') scans++;
        if (decision.show) { expect(scans).toBeGreaterThanOrEqual(MIN_SCANS_BETWEEN); scans = 0; }
        if (event.type === 'interstitialShown') scans = 0;
      }
    }
  });

  it('shows at most once per 180 s', () => {
    for (const tr of traces) {
      let last: number | null = null;
      let now = 0;
      for (const { event, decision } of tr) {
        if (event.type === 'appLaunch' && event.atMs < now && last !== null) last = Math.min(last, event.atMs);
        now = event.type === 'appLaunch' ? event.atMs : Math.max(now, event.atMs);
        if (decision.show) {
          if (last !== null) expect(now - last).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
          last = now;
        }
        if (event.type === 'interstitialShown') last = now;
      }
    }
  });

  it('never shows within 60 s after rewardedShown', () => {
    for (const tr of traces) {
      let rew: number | null = null;
      let now = 0;
      for (const { event, decision } of tr) {
        if (event.type === 'appLaunch' && event.atMs < now && rew !== null) rew = Math.min(rew, event.atMs);
        now = event.type === 'appLaunch' ? event.atMs : Math.max(now, event.atMs);
        if (event.type === 'rewardedShown') rew = now;
        if (decision.show && rew !== null) expect(now - rew).toBeGreaterThanOrEqual(REWARDED_COOLDOWN_MS);
      }
    }
  });

  it('requests a preload on an earlier event before every show, and never show with preload', () => {
    for (const tr of traces) {
      let at: number | null = null; // time of the outstanding preload request
      let now = 0;
      for (const { event, decision } of tr) {
        now = event.type === 'appLaunch' ? event.atMs : Math.max(now, event.atMs);
        if (event.type === 'appLaunch') at = null;
        if (decision.show) {
          expect(decision.preload).toBe(false);
          expect(at).not.toBeNull();
          expect(now - at!).toBeLessThan(PRELOAD_TTL_MS);
          at = null;
        } else if (decision.preload) at = now;
        if (event.type === 'interstitialShown') at = null;
      }
    }
  });

  it('never requests a preload twice without a show, a launch or the timeout between', () => {
    for (const tr of traces) {
      let at: number | null = null;
      let now = 0;
      for (const { event, decision } of tr) {
        now = event.type === 'appLaunch' ? event.atMs : Math.max(now, event.atMs);
        if (event.type === 'appLaunch' || event.type === 'interstitialShown') at = null;
        if (decision.show) at = null;
        if (decision.preload) {
          if (at !== null) expect(now - at).toBeGreaterThanOrEqual(PRELOAD_TTL_MS);
          at = now;
        }
      }
    }
  });

  it('is deterministic and unchanged by a JSON round trip of the state at any point', () => {
    for (let i = 0; i < 500; i++) {
      const tr = traces[i]!;
      let a = createCadence();
      let b = createCadence();
      for (const { event } of tr) {
        const ra = reduce(a, event);
        const rb = reduce(JSON.parse(JSON.stringify(b)) as State, event);
        expect(rb).toEqual(ra);
        a = ra.state; b = rb.state;
      }
    }
  });
});
