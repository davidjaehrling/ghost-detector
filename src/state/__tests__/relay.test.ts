import { describe, expect, it } from 'vitest';
import {
  type NotifyBackend,
  type RelayContext,
  createRelayStore,
  fitRelay,
  refreshRelay,
  relayCopy,
  relayDue,
  relayOn,
  toggleRelay,
} from '../relay';
import type { KeyValueStore } from '../scans';

const mem = (): KeyValueStore => {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

const ctx = (over: Partial<RelayContext> = {}): RelayContext => ({
  state: { offered: false, enabled: false, system: 'unknown' },
  scanCount: 3,
  hasStrong: false,
  sessionIndex: 1,
  fromResult: true,
  interstitial: false,
  ...over,
});

describe('relayDue: the trigger', () => {
  it('is due on the first return after the third scan', () => {
    expect(relayDue(ctx({ scanCount: 2 }))).toBe(false);
    expect(relayDue(ctx({ scanCount: 3 }))).toBe(true);
    expect(relayDue(ctx({ scanCount: 9 }))).toBe(true);
  });
  it('is due on the first return after a STRONG result, before the third scan', () => {
    expect(relayDue(ctx({ scanCount: 1, hasStrong: true }))).toBe(true);
    expect(relayDue(ctx({ scanCount: 1, hasStrong: false }))).toBe(false);
  });
  it('defers under an interstitial and is due on the next eligible return', () => {
    expect(relayDue(ctx({ interstitial: true }))).toBe(false);
    expect(relayDue(ctx({ interstitial: false }))).toBe(true);
  });
  it('shows once only, whatever the answer', () => {
    for (const enabled of [true, false]) {
      for (const system of ['unknown', 'granted', 'denied'] as const) {
        expect(relayDue(ctx({ state: { offered: true, enabled, system } }))).toBe(false);
      }
    }
  });
  it('is never due away from a return from a result, or in the first session', () => {
    expect(relayDue(ctx({ fromResult: false }))).toBe(false);
    expect(relayDue(ctx({ sessionIndex: 0 }))).toBe(false);
    expect(relayDue(ctx({ sessionIndex: -1 }))).toBe(false);
  });
});

function backend(answer: 'granted' | 'denied', permission: 'granted' | 'denied' | 'unknown' = 'unknown') {
  const calls: string[] = [];
  const b: NotifyBackend = {
    ensureChannel: async () => void calls.push('channel'),
    permission: async () => permission,
    request: async () => {
      calls.push('request');
      return answer;
    },
    openSystemSettings: async () => void calls.push('settings'),
  };
  return { b, calls };
}

describe('FIT RELAY', () => {
  it('creates the channel before the permission request', async () => {
    const store = createRelayStore(mem());
    const { b, calls } = backend('granted');
    expect(await fitRelay(store, b)).toBe(true);
    expect(calls).toEqual(['channel', 'request']);
    expect(relayOn(store.get())).toBe(true);
  });
  it('a system denial leaves the relay off and is never asked again', async () => {
    const store = createRelayStore(mem());
    const { b, calls } = backend('denied');
    expect(await fitRelay(store, b)).toBe(false);
    expect(store.get()).toMatchObject({ enabled: false, system: 'denied' });
    expect(await fitRelay(store, b)).toBe(false);
    expect(calls.filter((c) => c === 'request')).toHaveLength(1);
  });
  it('the two result lines are the brief copy', () => {
    expect(relayCopy.fitted).toBe('Relay fitted. Change in Settings.');
    expect(relayCopy.notFitted).toBe('Relay not fitted. Change in Settings.');
    expect(relayCopy.fit).toBe('FIT RELAY');
    expect(relayCopy.notNow).toBe('NOT NOW');
    expect(relayCopy.header).toBe('FIELD LOG RELAY');
  });
});

describe('Settings RELAY row', () => {
  it('is off by default and on only with the permission granted', () => {
    const store = createRelayStore(mem());
    expect(relayOn(store.get())).toBe(false);
    store.setEnabled(true);
    expect(relayOn(store.get())).toBe(false);
    store.setSystem('granted');
    expect(relayOn(store.get())).toBe(true);
  });
  it('after NOT NOW the row asks once through the same flow', async () => {
    const store = createRelayStore(mem());
    const { b, calls } = backend('granted');
    await toggleRelay(store, b);
    expect(calls).toEqual(['channel', 'request']);
    expect(relayOn(store.get())).toBe(true);
    await toggleRelay(store, b); // off
    expect(relayOn(store.get())).toBe(false);
    await toggleRelay(store, b); // on again without a dialog
    expect(relayOn(store.get())).toBe(true);
    expect(calls.filter((c) => c === 'request')).toHaveLength(1);
  });
  it('after a system denial the row opens the system settings and never the dialog', async () => {
    const store = createRelayStore(mem());
    store.setSystem('denied');
    const { b, calls } = backend('granted');
    await toggleRelay(store, b);
    expect(calls).toEqual(['settings']);
    expect(relayOn(store.get())).toBe(false);
  });
  it('a permission revoked in the system turns the row off', async () => {
    const store = createRelayStore(mem());
    store.setSystem('granted');
    store.setEnabled(true);
    await refreshRelay(store, backend('granted', 'denied').b);
    expect(relayOn(store.get())).toBe(false);
    expect(store.get().system).toBe('denied');
  });
  it('persists and reloads', () => {
    const storage = mem();
    const a = createRelayStore(storage);
    a.markOffered();
    a.setSystem('granted');
    a.setEnabled(true);
    expect(createRelayStore(storage).get()).toEqual({ offered: true, enabled: true, system: 'granted' });
  });
});
