import { describe, expect, it } from 'vitest';
import { color, font, tierFor } from '../tokens';

describe('tokens', () => {
  it('all colours are 6-digit hex', () => {
    for (const v of Object.values(color)) expect(v).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('no colour is pure black or a pure grey', () => {
    for (const v of Object.values(color)) {
      expect(v.toLowerCase()).not.toBe('#000000');
      const r = v.slice(1, 3);
      const g = v.slice(3, 5);
      const b = v.slice(5, 7);
      expect(r === g && g === b).toBe(false);
    }
  });

  it('tierFor boundaries match 0/20/45/70/90', () => {
    expect(tierFor(0)).toBe('quiet');
    expect(tierFor(19)).toBe('quiet');
    expect(tierFor(20)).toBe('trace');
    expect(tierFor(44)).toBe('trace');
    expect(tierFor(45)).toBe('active');
    expect(tierFor(69)).toBe('active');
    expect(tierFor(70)).toBe('strong');
    expect(tierFor(89)).toBe('strong');
    expect(tierFor(90)).toBe('critical');
    expect(tierFor(100)).toBe('critical');
  });

  it('font has exactly two families', () => {
    const families = new Set(Object.values(font).map((f) => f.split('_')[0]));
    expect(families.size).toBe(2);
  });
});
