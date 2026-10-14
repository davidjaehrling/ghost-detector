import { describe, expect, it } from 'vitest';
import { HIRES_SETTLE_MS, OFFER_DELAY_MS, OFFER_TIERS, offerDueAt, shareCopy } from '../share';

describe('share copy', () => {
  it('carries the brief strings exactly', () => {
    expect(shareCopy.ready()).toBe('Field card ready. SHARE prints it.');
    expect(shareCopy.updated).toBe('Field card updated. Class and EVP added.');
    expect(shareCopy.format).toBe('Print field card. Format?');
    expect([shareCopy.story, shareCopy.square, shareCopy.cancel]).toEqual(['9:16', '1:1', 'CANCEL']);
    expect(shareCopy.printing).toBe('PRINTING FIELD CARD. STAND BY.');
    expect(shareCopy.fault).toBe('E-31 PRINTER FAULT. CARD NOT SAVED.');
    expect(shareCopy.title('0041')).toBe('Send field card · CASE 0041');
  });
  it('offers proactively on ACTIVE and above only', () => {
    expect([...OFFER_TIERS]).toEqual(['active', 'strong', 'critical']);
  });
});

describe('offerDueAt', () => {
  it('is 3.0 s after the reveal settles', () => {
    expect(OFFER_DELAY_MS).toBe(3000);
    expect(offerDueAt('ready', { stableAt: 10_000, unlockAt: null, closedAt: null })).toBe(13_000);
  });
  it('waits until 3.0 s after a rewarded ad closed', () => {
    expect(offerDueAt('ready', { stableAt: 10_000, unlockAt: null, closedAt: 11_500 })).toBe(14_500);
    expect(offerDueAt('ready', { stableAt: 10_000, unlockAt: null, closedAt: 5_000 })).toBe(13_000);
  });
  it('after a Deep Scan comes 3.0 s after the high-resolution figure has faded in', () => {
    expect(offerDueAt('updated', { stableAt: 10_000, unlockAt: 20_000, closedAt: 20_000 })).toBe(20_000 + HIRES_SETTLE_MS + 3000);
  });
});
