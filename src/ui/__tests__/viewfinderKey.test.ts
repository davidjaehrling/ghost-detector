import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cadenceStore } from '../../state/cadence';
import { SHOW_DELAY_MS, onBackToViewfinder, onFreshResult, resetInterstitialRuntime, setGate, takeReturnNote } from '../interstitial';
import { openViewfinder } from '../log/nav';

const load = vi.fn(async () => true);
const show = vi.fn(async () => ({ shown: true, earned: false }));

vi.mock('../../ads', () => ({ ensureConsent: async () => ({}), interstitial: { load: () => load(), show: () => show() } }));
vi.mock('../../analytics', () => ({ track: () => {} }));
vi.mock('../../state/cadence', async (orig) => {
  const mod = await orig<typeof import('../../state/cadence')>();
  return { ...mod, cadenceStore: mod.createCadenceStore({ storage: null, now: () => Date.now() }) };
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000_000);
  load.mockClear();
  show.mockClear();
  resetInterstitialRuntime();
  cadenceStore.reset();
  // A session-1 install with two earlier scans: the machine is ready to show at an explicit return.
  cadenceStore.setSessions(1);
  cadenceStore.coldStart();
  for (let i = 0; i < 2; i++) cadenceStore.scanComplete();
});
afterEach(() => vi.useRealTimers());

// D-045: the VIEWFINDER key on the history screen is plain navigation. It is not an interstitial break:
// only the explicit return from a result (onBackToViewfinder) is, so LOG and VIEWFINDER add no trigger.
describe('the VIEWFINDER key', () => {
  it('only navigates: the router is called once and nothing else', () => {
    const router = { dismissTo: vi.fn() };
    openViewfinder(router);
    expect(router.dismissTo).toHaveBeenCalledExactlyOnceWith('/viewfinder');
  });

  it('never shows an interstitial, however many times it is pressed, with the gate open', async () => {
    onFreshResult();
    const router = { dismissTo: vi.fn() };
    for (let i = 0; i < 5; i++) openViewfinder(router);
    setGate(true);
    await vi.advanceTimersByTimeAsync(SHOW_DELAY_MS * 10);
    expect(show).not.toHaveBeenCalled();
    expect(takeReturnNote()).toBeNull();
  });

  it('does not consume the result break: the explicit return afterwards still counts', async () => {
    onFreshResult();
    openViewfinder({ dismissTo: () => {} });
    onBackToViewfinder();
    expect(takeReturnNote()).toEqual({ interstitial: true });
    setGate(true);
    await vi.advanceTimersByTimeAsync(SHOW_DELAY_MS + 50);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('adds no cadence event: the session and scan counters stay as they were', () => {
    const before = cadenceStore.sessionIndex();
    const spy = vi.spyOn(cadenceStore, 'returnToViewfinder');
    openViewfinder({ dismissTo: () => {} });
    expect(spy).not.toHaveBeenCalled();
    expect(cadenceStore.sessionIndex()).toBe(before);
  });
});
