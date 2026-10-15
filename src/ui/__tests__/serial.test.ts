import { describe, expect, it } from 'vitest';
import { isShortPlate, plateSerial, stickerShowsSerial } from '../serial';

const SERIAL = 'FS4-8711-00417-9';

describe('serial rule', () => {
  it.each([320, 339])('short plate and full serial on the sticker at %i', (w) => {
    expect(plateSerial(SERIAL, w)).toBe('00417-9');
    expect(stickerShowsSerial(w)).toBe(true);
  });
  it.each([340, 360, 375, 380, 390, 428])('full plate and no serial on the sticker at %i', (w) => {
    expect(plateSerial(SERIAL, w)).toBe(SERIAL);
    expect(stickerShowsSerial(w)).toBe(false);
  });
  it('the full serial is always printed once', () => {
    for (const w of [320, 339, 340, 360, 380, 412, 600]) {
      const printed = [plateSerial(SERIAL, w), stickerShowsSerial(w) ? SERIAL : ''];
      expect(printed).toContain(SERIAL);
      expect(isShortPlate(w)).toBe(w < 340);
    }
  });
});
