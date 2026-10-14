import { describe, expect, it } from 'vitest';
import { fault, faultArmed } from '../faults';
import { parseFaults } from '../faultsCore';

describe('fault injection', () => {
  it('parses a comma list and drops unknown names', () => {
    expect([...parseFaults('?fault=skia,storage-write,nope')]).toEqual(['skia', 'storage-write']);
    expect(parseFaults('?lang=de').size).toBe(0);
    expect(parseFaults('').size).toBe(0);
  });

  it('the native module never arms a fault', () => {
    expect(fault('skia')).toBe(false);
    expect(faultArmed('render')).toBe(false);
  });
});
