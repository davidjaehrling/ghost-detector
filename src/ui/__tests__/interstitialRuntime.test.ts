import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_GAP_MS, cadenceStore } from '../../state/cadence';
import { SHOW_DELAY_MS, TAP_EXPIRY_MS, onBackToViewfinder, onFreshResult, resetInterstitialRuntime, setGate, startCadence } from '../interstitial';

const load = vi.fn(async () => true);
const show = vi.fn(async () => ({ shown: true, earned: false }));
const track = vi.fn();

vi.mock('../../ads', () => ({ ensureConsent: async () => ({}), interstitial: { load: () => load(), show: () => show() } }));
vi.mock('../../analytics', () => ({ track: (e: string) => track(e) }));
vi.mock('../../state/cadence', async (orig) => {
  const mod = await orig<typeof import('../../state/cadence')>();
  return { ...mod, cadenceStore: mod.createCadenceStore({ storage: null, now: () => Date.now() }) };
});

function fakeAppState() {
  let cb: (s: string) => void = () => {};
  return { addEventListener: (_t: 'change', l: (s: string) => void) => void (cb = l), emit: (s: string) => cb(s) };
}

// A session-1 install with two earlier scans, so the machine preloads at start and may show.
function sessionOne() {
  cadenceStore.setSessions(1);
  cadenceStore.coldStart();
  for (let i = 0; i < 2; i++) cadenceStore.scanComplete();
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000_000);
  load.mockClear();
  show.mockClear();
  track.mockClear();
  resetInterstitialRuntime();
  cadenceStore.reset();
});
afterEach(() => vi.useRealTimers());

describe('interstitial show rules', () => {
  it('drops a pending show whose gate opens more than 3 s after the tap', async () => {
    sessionOne();
    onFreshResult();
    onBackToViewfinder();
    await vi.advanceTimersByTimeAsync(TAP_EXPIRY_MS + 1);
    setGate(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(show).not.toHaveBeenCalled();
  });

  it('still shows when the gate opens just inside 3 s', async () => {
    sessionOne();
    onFreshResult();
    onBackToViewfinder();
    await vi.advanceTimersByTimeAsync(TAP_EXPIRY_MS - 100);
    setGate(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('shows no earlier than 500 ms after the tap, and only once the viewfinder gate is open', async () => {
    sessionOne();
    onFreshResult();
    onBackToViewfinder();
    expect(show).not.toHaveBeenCalled();
    // The viewfinder renders 200 ms after the tap: still not before 500 ms.
    await vi.advanceTimersByTimeAsync(200);
    setGate(true);
    await vi.advanceTimersByTimeAsync(SHOW_DELAY_MS - 201);
    expect(show).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(show).toHaveBeenCalledTimes(1);
    await flush();
    expect(track).toHaveBeenCalledWith('interstitial_shown');
  });

  it('a late viewfinder shows at once when 500 ms have already passed', async () => {
    sessionOne();
    onFreshResult();
    onBackToViewfinder();
    await vi.advanceTimersByTimeAsync(900);
    setGate(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('never shows while the gate is closed (a permission prompt is up)', async () => {
    sessionOne();
    onFreshResult();
    onBackToViewfinder();
    await vi.advanceTimersByTimeAsync(2000);
    expect(show).not.toHaveBeenCalled();
    setGate(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('closing the gate before the delay ends cancels the timer', async () => {
    sessionOne();
    onFreshResult();
    onBackToViewfinder();
    setGate(true);
    await vi.advanceTimersByTimeAsync(300);
    setGate(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(show).not.toHaveBeenCalled();
  });

  it('a failed load or show tells the machine nothing and tracks nothing', async () => {
    show.mockResolvedValueOnce({ shown: false, earned: false });
    sessionOne();
    onFreshResult();
    onBackToViewfinder();
    setGate(true);
    await vi.advanceTimersByTimeAsync(600);
    expect(show).toHaveBeenCalledTimes(1);
    expect(track).not.toHaveBeenCalled();
  });

  it('never shows in the first session', async () => {
    cadenceStore.coldStart();
    for (let i = 0; i < 3; i++) {
      onFreshResult();
      onBackToViewfinder();
    }
    setGate(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(show).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });
});

describe('sessions and the foreground', () => {
  it('a resume after more than 30 minutes is a new session and never a show', async () => {
    const app = fakeAppState();
    startCadence(app, '');
    expect(cadenceStore.sessionIndex()).toBe(0);
    app.emit('background');
    vi.setSystemTime(Date.now() + SESSION_GAP_MS + 1);
    app.emit('active');
    expect(cadenceStore.sessionIndex()).toBe(1);
    setGate(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(show).not.toHaveBeenCalled();
  });

  it('a shorter absence is not a new session', () => {
    const app = fakeAppState();
    startCadence(app, '');
    app.emit('background');
    vi.setSystemTime(Date.now() + SESSION_GAP_MS - 1000);
    app.emit('active');
    expect(cadenceStore.sessionIndex()).toBe(0);
  });

  it('?session=1 makes the cold start session 1', () => {
    startCadence(fakeAppState(), '?static=1&session=1');
    expect(cadenceStore.sessionIndex()).toBe(1);
  });
});
