import { describe, expect, it } from 'vitest';
import { KEY_SLOTS, KEY_W, keyLayout } from '../keyLayout';
import { composeFields } from '../readoutFields';

describe('key row geometry', () => {
  it.each([360, 390, 428])('fits four 72 px keys with the margin on the 4 px grid at %i', (screenW) => {
    const plateW = screenW - 28;
    const { gap, left } = keyLayout(plateW);
    expect(gap % 4).toBe(0);
    expect(left % 4).toBe(0);
    const content = KEY_SLOTS * KEY_W + (KEY_SLOTS - 1) * gap;
    expect(left + content).toBeLessThanOrEqual(plateW);
    // 12 px from the screen edge at the least (housing gutter 14 plus the plate margin).
    expect(14 + left).toBeGreaterThanOrEqual(12);
    expect(14 + (plateW - left - content)).toBeGreaterThanOrEqual(12);
  });
});

describe('readout fields', () => {
  const join = (f: string[]) => f.join('').replace(/ /g, ' ');
  it('right-aligns the number in 5ch and left-aligns the unit', () => {
    expect(join(composeFields({ label: 'FLUX', value: '280', unit: 'mG', labelCh: 6 }))).toBe('FLUX     280 mG  ');
    expect(join(composeFields({ label: 'THERM', value: '-0.2', unit: '°C', labelCh: 6 }))).toBe('THERM   -0.2 °C  ');
  });
  it('keeps every column when rows differ in length', () => {
    const a = composeFields({ label: 'FLUX', value: '1920', unit: 'mG', status: 'OK' });
    const b = composeFields({ label: 'ACOUST', value: '-59', unit: 'dBFS', status: 'OK' });
    expect(a.join('').length).toBe(b.join('').length);
    expect(a.map((f) => f.length)).toEqual(b.map((f) => f.length));
  });
});
