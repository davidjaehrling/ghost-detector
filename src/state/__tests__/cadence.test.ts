import { describe, expect, it } from 'vitest';
import { type KeyValueStore } from '../scans';
import { SESSION_GAP_MS, createCadenceStore } from '../cadence';

const mem = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

describe('cadence store', () => {
  it('the first cold start is session 0 and the counter moves on', () => {
    const c = createCadenceStore({ storage: mem(), now: clock().now });
    expect(c.sessionIndex()).toBe(-1);
    c.coldStart();
    expect(c.sessionIndex()).toBe(0);
    expect(c.snapshot().sessions).toBe(1);
  });

  it('the counter survives a restart: the second cold start is session 1', () => {
    const storage = mem();
    createCadenceStore({ storage, now: clock().now }).coldStart();
    const second = createCadenceStore({ storage, now: clock(2_000_000).now });
    second.coldStart();
    expect(second.sessionIndex()).toBe(1);
    expect(second.snapshot().machine.sessionIndex).toBe(1);
  });

  it('setSessions picks the next session index (the ?session=N harness)', () => {
    const c = createCadenceStore({ storage: mem(), now: clock().now });
    c.setSessions(1);
    c.coldStart();
    expect(c.sessionIndex()).toBe(1);
  });

  it('never shows in session 0, however many scans', () => {
    const t = clock();
    const c = createCadenceStore({ storage: mem(), now: t.now });
    c.coldStart();
    for (let i = 0; i < 4; i++) {
      c.scanComplete();
      c.resultShown();
      t.advance(60_000);
      expect(c.returnToViewfinder()).toEqual({ preload: false, show: false });
    }
  });

  it('session 1 after two earlier scans: preloads at start, shows on the first return from a result', () => {
    const storage = mem();
    const t = clock();
    const first = createCadenceStore({ storage, now: t.now });
    first.coldStart();
    for (let i = 0; i < 2; i++) {
      first.scanComplete();
      first.resultShown();
      first.returnToViewfinder();
    }
    t.advance(60_000);
    const second = createCadenceStore({ storage, now: t.now });
    expect(second.coldStart().preload).toBe(true);
    second.scanComplete();
    second.resultShown();
    t.advance(10_000);
    expect(second.returnToViewfinder().show).toBe(true);
    // A second show needs two more scans and 180 s.
    second.interstitialShown();
    second.scanComplete();
    second.resultShown();
    expect(second.returnToViewfinder().show).toBe(false);
  });

  it('returnToViewfinder without a result on screen never shows (a resume is not a return)', () => {
    const storage = mem();
    const t = clock();
    const c = createCadenceStore({ storage, now: t.now });
    c.setSessions(1);
    c.coldStart();
    c.scanComplete();
    c.scanComplete();
    expect(c.returnToViewfinder().show).toBe(false);
  });

  it('a new session after the background gap gets the next index; the gap constant is 30 minutes', () => {
    expect(SESSION_GAP_MS).toBe(1_800_000);
    const c = createCadenceStore({ storage: mem(), now: clock().now });
    c.coldStart();
    c.beginSession();
    expect(c.sessionIndex()).toBe(1);
  });

  it('ignores a corrupt stored value', () => {
    const storage = mem();
    storage.setItem('fs4.cadence.v1', '{"sessions":"x"}');
    const c = createCadenceStore({ storage, now: clock().now });
    c.coldStart();
    expect(c.sessionIndex()).toBe(0);
  });
});
