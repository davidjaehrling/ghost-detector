import { describe, expect, it } from 'vitest';
import { legendFit } from '../keyLayout';

describe('key legend fit', () => {
  it('leaves the English legends alone', () => {
    for (const l of ['CAPTURE', 'NEW SCAN', 'SHARE', 'THERM', 'CANCEL']) expect(legendFit(l), l).toBeNull();
  });
  it('tightens the tracking for an eight letter word, then the size, and never below 9 px', () => {
    expect(legendFit('EINBAUEN')).toEqual({ fontSize: 12, letterSpacing: 0.2 });
    const long = legendFit('ABCDEFGHIJKL');
    expect(long!.fontSize).toBeGreaterThanOrEqual(9);
  });
});
