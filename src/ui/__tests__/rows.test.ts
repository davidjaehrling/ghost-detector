import { describe, expect, it } from 'vitest';
import { KEY_EDGE_MIN, KEY_GUTTER, KEY_SLOTS, KEY_W, keyLayout } from '../keyLayout';
import { composeFields } from '../readoutFields';

describe('key row geometry', () => {
  // Margins are measured the way the screen shows them: the housing gutter plus the
  // plate margin on the left, and what is left of the plate after the four caps and
  // three gaps on the right. A wider cap or a wider gap pushes the right margin down.
  it.each([360, 390, 428])('keeps 12 px from each screen edge to the outer caps at %i', (screenW) => {
    const plateW = screenW - KEY_GUTTER * 2;
    const { gap, left } = keyLayout(plateW);
    expect(gap % 4).toBe(0);
    expect(left % 4).toBe(0);
    const content = KEY_SLOTS * KEY_W + (KEY_SLOTS - 1) * gap;
    const leftMargin = KEY_GUTTER + left;
    const rightMargin = screenW - (KEY_GUTTER + left + content);
    expect(leftMargin).toBeGreaterThanOrEqual(KEY_EDGE_MIN);
    expect(rightMargin).toBeGreaterThanOrEqual(KEY_EDGE_MIN);
    expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(8);
  });

  it('fails when a cap or a gap is too wide for 360', () => {
    const plateW = 360 - KEY_GUTTER * 2;
    const widerCap = 80;
    const { gap, left } = keyLayout(plateW);
    const content = KEY_SLOTS * widerCap + (KEY_SLOTS - 1) * gap;
    expect(360 - (KEY_GUTTER + left + content)).toBeLessThan(KEY_EDGE_MIN);
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
