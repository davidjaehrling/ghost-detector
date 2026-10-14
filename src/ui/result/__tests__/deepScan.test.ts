import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { placeGhost } from '../../../fx/ghostV0/placement';
import { HIRES_SCALE, deepCopy, evpLine, scalePlacement } from '../deepCopy';
import { useDeepScan } from '../deepScan';

// A minimal hook runtime: enough React to drive useDeepScan without a renderer.
const rt = vi.hoisted(() => {
  const r = {
    slots: [] as unknown[],
    i: 0,
    dirty: false,
    effects: [] as { slot: number; fn: () => void | (() => void); deps: unknown[] }[],
  };
  return r;
});
vi.mock('react', () => ({
  useState: (init: unknown) => {
    const n = rt.i++;
    if (!(n in rt.slots)) rt.slots[n] = typeof init === 'function' ? (init as () => unknown)() : init;
    return [
      rt.slots[n],
      (v: unknown) => {
        rt.slots[n] = v;
        rt.dirty = true;
      },
    ];
  },
  useRef: (init: unknown) => {
    const n = rt.i++;
    if (!(n in rt.slots)) rt.slots[n] = { current: init };
    return rt.slots[n];
  },
  useSyncExternalStore: (_sub: unknown, get: () => unknown) => (rt.i++, get()),
  useEffect: (fn: () => void | (() => void), deps: unknown[]) => {
    const n = rt.i++;
    const prev = rt.slots[n] as unknown[] | undefined;
    if (!prev || prev.some((d, k) => d !== deps[k])) {
      rt.slots[n] = deps;
      rt.effects.push({ slot: n, fn, deps });
    }
  },
}));

const track = vi.fn();
const consent = vi.hoisted(() => ({ resolved: true, requestable: true }));
const load = vi.fn(async () => true);
const show = vi.fn(async () => ({ shown: true, earned: true }));
vi.mock('../../../analytics', () => ({ track: (e: string) => track(e) }));
vi.mock('../../../ads', () => ({
  ensureConsent: async () => ({}),
  consentState: () => ({ resolved: consent.resolved }),
  canRequestAds: () => consent.requestable,
  rewarded: { subscribe: () => () => {}, status: () => 'ready', load: () => load(), show: () => show() },
}));
vi.mock('../../../state/useConsent', () => ({ useConsent: () => ({ status: 'obtained', canRequestAds: consent.requestable }) }));
const markDeclined = vi.fn();
vi.mock('../../../state/scans', () => ({ unlockDeepScan: vi.fn(), markDeclined: (id: string) => markDeclined(id) }));
vi.mock('../../interstitial', () => ({ onRewardedShown: vi.fn() }));

function renderDeepScan(persist = false) {
  let out!: ReturnType<typeof useDeepScan>;
  const render = () => {
    for (let pass = 0; pass < 5; pass++) {
      rt.i = 0;
      rt.dirty = false;
      // The harness stands in for a component render, so the hook is called here on purpose.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      out = useDeepScan({ id: 'scan-1', enabled: true, unlockedAt: undefined, persist });
      const todo = rt.effects.splice(0);
      for (const e of todo) e.fn();
      if (!rt.dirty && todo.length === 0) break;
    }
    return out;
  };
  return render;
}

const BANNED = [/\bfree\b/i, /unlock now/i, /tap to continue/i, /continue scan/i, /\breal\b/i, /\btruer\b/i, /\baccurate\b/i, /\bactual\b/i];

describe('DEEP SCAN copy', () => {
  it('carries the sublabel and the offline line exactly', () => {
    expect(deepCopy.sub).toBe('SPONSORED VIDEO PLAYS FIRST');
    expect(deepCopy.offline).toBe('DEEP SCAN OFFLINE. NO SIGNAL.');
  });
  it('uses none of the banned phrases and claims no real or truer reading', () => {
    for (const text of Object.values(deepCopy)) for (const re of BANNED) expect(text).not.toMatch(re);
    for (const line of Array.from({ length: 48 }, (_, i) => evpLine(i))) for (const re of BANNED) expect(line).not.toMatch(re);
  });
});

describe('evpLine', () => {
  it('is a pure function of the seed', () => {
    expect(evpLine(1234)).toBe(evpLine(1234));
    expect(new Set(Array.from({ length: 48 }, (_, i) => evpLine(i))).size).toBeGreaterThan(6);
  });
  it('fits the EVP row (30 characters or fewer)', () => {
    for (let i = 0; i < 48; i++) expect(evpLine(i).length).toBeLessThanOrEqual(30);
  });
});

describe('scalePlacement', () => {
  const region = { x: 0.1, y: 0.4, w: 0.4, h: 0.4, cx: 0.3, cy: 0.6, areaFraction: 0.16 };
  const p = placeGhost(region, { w: 300, h: 400 }, 7, { tier: 'critical' });
  it('multiplies every pixel field and keeps opacity, flip and alphas', () => {
    const q = scalePlacement(p, HIRES_SCALE);
    expect([q.x, q.y, q.w, q.h]).toEqual([p.x * 2, p.y * 2, p.w * 2, p.h * 2]);
    expect(q.opacity).toBe(p.opacity);
    expect(q.flipX).toBe(p.flipX);
    expect(q.offsetCopies.map((c) => c.alpha)).toEqual(p.offsetCopies.map((c) => c.alpha));
    expect(q.offsetCopies.map((c) => c.dx)).toEqual(p.offsetCopies.map((c) => c.dx * 2));
    if (p.echo) expect(q.echo?.dy).toBe(p.echo.dy * 2);
  });
});

describe('DEEP SCAN analytics', () => {
  beforeEach(() => {
    rt.slots = [];
    rt.effects = [];
    track.mockClear();
    show.mockClear();
    load.mockClear();
  });

  it('tracks deep_scan_offered once when the key goes live, and not deep_scan_rewarded yet', () => {
    const render = renderDeepScan();
    expect(render().state).toBe('ready');
    render();
    expect(track.mock.calls).toEqual([['deep_scan_offered']]);
  });

  it('tracks deep_scan_rewarded when the reward is earned', async () => {
    const render = renderDeepScan();
    await render().press();
    expect(show).toHaveBeenCalledTimes(1);
    expect(track.mock.calls).toEqual([['deep_scan_offered'], ['deep_scan_rewarded']]);
  });

  it('does not track deep_scan_rewarded when the ad is dismissed without the reward', async () => {
    show.mockResolvedValueOnce({ shown: true, earned: false });
    const render = renderDeepScan();
    await render().press();
    expect(track).not.toHaveBeenCalledWith('deep_scan_rewarded');
  });

  it('marks the case declined when the ad is dismissed without the reward', async () => {
    show.mockResolvedValueOnce({ shown: true, earned: false });
    await renderDeepScan(true)().press();
    expect(markDeclined).toHaveBeenCalledWith('scan-1');
  });

  it('does not mark the case declined when the reward is earned, or for a record not in the store', async () => {
    markDeclined.mockClear();
    await renderDeepScan(true)().press();
    expect(markDeclined).not.toHaveBeenCalled();
    rt.slots = [];
    rt.effects = [];
    show.mockResolvedValueOnce({ shown: true, earned: false });
    await renderDeepScan(false)().press();
    expect(markDeclined).not.toHaveBeenCalled();
  });

  it('a declined ad requests a fresh one, and a second tap plays it', async () => {
    show.mockResolvedValueOnce({ shown: true, earned: false });
    const render = renderDeepScan();
    await render().press();
    // One preload on mount, one fresh request after the decline.
    expect(load).toHaveBeenCalledTimes(2);
    expect(render().state).toBe('ready');
    await render().press();
    expect(show).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenCalledWith('deep_scan_rewarded');
  });

  it('maps a show that did not display to the offline state', async () => {
    show.mockResolvedValueOnce({ shown: false, earned: false });
    const render = renderDeepScan();
    await render().press();
    const after = render();
    expect(after.state).toBe('offline');
    await after.press();
    expect(show).toHaveBeenCalledTimes(1);
  });
});

describe('DEEP SCAN before consent resolves', () => {
  beforeEach(() => {
    rt.slots = [];
    rt.effects = [];
    load.mockClear();
  });
  afterEach(() => {
    consent.resolved = true;
    consent.requestable = true;
  });

  it('warms, not offline, while the consent check is still pending', () => {
    consent.resolved = false;
    consent.requestable = false;
    expect(renderDeepScan()().state).toBe('warming');
  });

  it('goes offline only after a resolved denial', async () => {
    consent.resolved = false;
    consent.requestable = false;
    const render = renderDeepScan();
    expect(render().state).toBe('warming');
    await Promise.resolve();
    await Promise.resolve();
    expect(render().state).toBe('offline');
  });
});
