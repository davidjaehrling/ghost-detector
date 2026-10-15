import { describe, expect, it } from 'vitest';
import { DEEP_GUARD_MS, deepPress, deepTier } from '../deepKey';

describe('DEEP SCAN key 4, two-step arm', () => {
  it('the first press arms, the second runs', () => {
    expect(deepPress({ state: 'ready', armed: false, sinceShownMs: 2000 })).toBe('arm');
    expect(deepPress({ state: 'ready', armed: true, sinceShownMs: 2000 })).toBe('run');
  });

  it('a press within 500 ms of the result appearing does nothing, armed or not', () => {
    expect(DEEP_GUARD_MS).toBe(500);
    expect(deepPress({ state: 'ready', armed: false, sinceShownMs: 499 })).toBe('ignore');
    expect(deepPress({ state: 'ready', armed: true, sinceShownMs: 0 })).toBe('ignore');
    expect(deepPress({ state: 'ready', armed: false, sinceShownMs: 500 })).toBe('arm');
  });

  it('only a ready key reacts', () => {
    for (const state of ['warming', 'offline', 'running', 'unlocked'] as const) {
      expect(deepPress({ state, armed: true, sinceShownMs: 5000 })).toBe('ignore');
    }
  });

  it('QUIET and TRACE never carry the offer', () => {
    expect(['quiet', 'trace', 'active', 'strong', 'critical'].map((t) => deepTier(t as never))).toEqual([false, false, true, true, true]);
  });
});
