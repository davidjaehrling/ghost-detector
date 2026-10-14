import { describe, expect, it } from 'vitest';
import { sessionParam } from '../interstitialParams';

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
