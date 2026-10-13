import { describe, expect, it } from 'vitest';
import type { ScanRecord } from '../../../state/scans';
import { bestSoFar } from '../best';

const at = (h: number, m: number) => new Date(2026, 9, 13, h, m).getTime();
const rec = (id: string, spi: number, tier: string, createdAt: number, tag?: string): ScanRecord =>
  ({ id, createdAt, photoUri: 'p', tag, seed: 1, outcome: { tier, spi }, profile: {} }) as unknown as ScanRecord;

describe('bestSoFar', () => {
  it('is null with no prior cases', () => {
    expect(bestSoFar([])).toBeNull();
    expect(bestSoFar([rec('0001', 12, 'quiet', at(9, 0))], '0001')).toBeNull();
  });
  it('names the peak of the earlier cases, not the case on screen', () => {
    const all = [rec('0001', 84, 'strong', at(23, 41), 'cellar'), rec('0002', 30, 'trace', at(23, 50), 'hall'), rec('0003', 9, 'quiet', at(23, 59))];
    expect(bestSoFar(all, '0003')).toEqual({ prefix: 'BEST SO FAR:', value: '84 STRONG · CELLAR · 23:41' });
  });
  it('drops the tag segment when there is none', () => {
    expect(bestSoFar([rec('0001', 50, 'active', at(7, 5))])?.value).toBe('50 ACTIVE · 07:05');
  });
});
