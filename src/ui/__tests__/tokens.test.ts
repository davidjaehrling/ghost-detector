import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { color, font, radius, size, space, tier, tierFor } from '../tokens';

// Parse the section 9 table of the bible at test time: | group | `name` | `value` | purpose |
const bible = readFileSync(new URL('../../../docs/instrument-bible.md', import.meta.url), 'utf8');
const section9 = bible.split(/^## 9\./m)[1]?.split(/^## 10\./m)[0] ?? '';
const rows = section9
  .split('\n')
  .filter((l) => l.startsWith('|'))
  .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));

const tick = (s: string) => s.replace(/`/g, '');
const group = (g: string) => rows.filter((r) => r[0] === g);

describe('tokens', () => {
  it('bible section 9 table was found', () => {
    expect(group('color')).toHaveLength(16);
  });

  it('every bible colour hex matches tokens.ts', () => {
    for (const r of group('color')) {
      const name = tick(r[1]) as keyof typeof color;
      expect(color[name], name).toBeDefined();
      expect(color[name].toLowerCase(), name).toBe(tick(r[2]).toLowerCase());
    }
    expect(Object.keys(color)).toHaveLength(group('color').length);
  });

  it('space, radius and size numbers match the bible', () => {
    const maps = { space, radius, size } as Record<string, Record<string, number>>;
    for (const g of ['space', 'radius', 'size']) {
      for (const r of group(g)) {
        const name = tick(r[1]);
        expect(maps[g][name], `${g}.${name}`).toBe(Number(tick(r[2])));
      }
    }
  });

  it('tier bounds match the bible row', () => {
    const row = group('tier')[0];
    const names = tick(row[1]).split(/\s+/);
    const bounds = row[2].split('/').map((n) => Number(n.trim()));
    expect(names).toEqual(Object.keys(tier));
    expect(Object.values(tier)).toEqual(bounds);
  });

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

  it('tierFor boundaries follow the table', () => {
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
