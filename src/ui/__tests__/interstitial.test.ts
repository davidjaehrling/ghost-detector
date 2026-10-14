import { describe, expect, it } from 'vitest';
import { gateOpenFor, sessionParam } from '../interstitialParams';

describe('?session=N harness param', () => {
  it('reads a small non-negative integer', () => {
    expect(sessionParam('?static=1&session=1')).toBe(1);
    expect(sessionParam('?session=0')).toBe(0);
  });
  it('ignores anything else', () => {
    expect(sessionParam('')).toBeNull();
    expect(sessionParam('?session=-1')).toBeNull();
    expect(sessionParam('?session=x')).toBeNull();
    expect(sessionParam('?session=12345')).toBeNull();
  });
});

describe('gateOpenFor', () => {
  it('opens only for a granted camera or the web fixture', () => {
    expect(gateOpenFor('camera')).toBe(true);
    expect(gateOpenFor('fixture')).toBe(true);
    for (const s of ['denied', 'ask', 'loading'] as const) expect(gateOpenFor(s)).toBe(false);
  });
});
