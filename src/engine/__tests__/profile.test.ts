import { describe, expect, it } from 'vitest';
import { generateProfile } from '../profile';
import { ATTACHMENT, BEHAVIOUR, CLASSES, DETAIL, PREFIXES, TEMPERAMENT, TIMING } from '../profileBank';
import { TIERS } from '../tiers';

describe('generateProfile', () => {
  it('is deterministic', () => {
    for (let s = 0; s < 200; s++) expect(generateProfile(s, 'active', { names: ['X-1'], lines: ['a'] })).toEqual(generateProfile(s, 'active', { names: ['X-1'], lines: ['a'] }));
  });

  it('shape: catalogue name, 3 to 5 distinct traits, era span 40 to 80 years', () => {
    for (let s = 0; s < 2000; s++) {
      const p = generateProfile(s * 7919, 'strong', []);
      expect(p.name).toMatch(/^[A-Z]{3}-\d{4}-[A-Z]$/);
      expect(p.traits.length).toBeGreaterThanOrEqual(3);
      expect(p.traits.length).toBeLessThanOrEqual(5);
      expect(new Set(p.traits).size).toBe(p.traits.length);
      const m = /^Era est\. (\d{4}) to (\d{4})$/.exec(p.era)!;
      expect(Number(m[2]) - Number(m[1])).toBeGreaterThanOrEqual(40);
      expect(Number(m[2]) - Number(m[1])).toBeLessThanOrEqual(80);
      expect(CLASSES).toContain(p.class);
    }
  });

  it('signature decoded: 41 to 73 for ACTIVE and above, lower below', () => {
    for (const tier of TIERS)
      for (let s = 0; s < 500; s++) {
        const p = generateProfile(s, tier, []).signatureDecodedPct;
        expect(Number.isInteger(p)).toBe(true);
        if (tier === 'quiet' || tier === 'trace') expect(p).toBeLessThan(41);
        else {
          expect(p).toBeGreaterThanOrEqual(41);
          expect(p).toBeLessThanOrEqual(73);
        }
      }
  });

  it('never repeats a name from the last 20 results', () => {
    const recent: string[] = [];
    for (let s = 0; s < 3000; s++) {
      const p = generateProfile(s, 'trace', recent.slice(-20));
      expect(recent.slice(-20)).not.toContain(p.name);
      recent.push(p.name);
    }
  });

  it('20 consecutive profiles, window carried forward: no repeated name or trait line', () => {
    for (const base of [0, 1000, 77777]) {
      const names: string[] = [];
      const lines: string[] = [];
      const hist: { names: string[]; lines: string[] }[] = [];
      for (let s = 0; s < 400; s++) {
        const p = generateProfile(base + s, 'active', { names: names.slice(-20), lines: hist.slice(-20).flatMap((h) => h.lines) });
        const win = hist.slice(-19);
        for (const h of win) {
          expect(h.names).not.toContain(p.name);
          for (const t of p.traits) expect(h.lines).not.toContain(t);
        }
        names.push(p.name);
        lines.push(...p.traits);
        hist.push({ names: [p.name], lines: p.traits });
      }
    }
  });

  it('falls back to the least recently used line when a bank is exhausted', () => {
    const lines = [...TIMING.slice(5), ...TIMING.slice(0, 4), TIMING[4]!]; // TIMING[4] is the most recent
    const all = [...TEMPERAMENT, ...ATTACHMENT, ...BEHAVIOUR, ...lines];
    const lru = TIMING[5]!; // oldest in the list
    let seen = 0;
    for (let s = 0; s < 300; s++) {
      const p = generateProfile(s, 'active', { names: [], lines: all });
      if (p.traits.some((t) => TIMING.includes(t as never))) { seen++; expect(p.traits).toContain(lru); }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('banks have at least 24 lines per slot', () => {
    for (const b of [TEMPERAMENT, ATTACHMENT, BEHAVIOUR, TIMING]) {
      expect(b.length).toBeGreaterThanOrEqual(24);
      expect(new Set(b).size).toBe(b.length);
    }
  });

  it('legacy string[] argument still works and equals empty lines', () => {
    expect(generateProfile(5, 'active', ['X-1'])).toEqual(generateProfile(5, 'active', { names: ['X-1'], lines: [] }));
  });

  it('avoids a name even when the seed would have produced it', () => {
    const first = generateProfile(42, 'active', []);
    const second = generateProfile(42, 'active', [first.name]);
    expect(second.name).not.toBe(first.name);
    expect(second.class).toBe(first.class);
  });

  it('word banks: prefixes match classes, no banned copy', () => {
    expect(PREFIXES.length).toBe(CLASSES.length);
    const all = [...CLASSES, ...TEMPERAMENT, ...ATTACHMENT, ...BEHAVIOUR, ...TIMING, ...DETAIL].join('\n');
    const banned = ['del' + 'v', 'tapes' + 'tr', 'pivo' + 'tal', 'cru' + 'cial', 'intri' + 'cat', 'testa' + 'ment', 'fos' + 'ter', 'land' + 'scape', 'under' + 'scor'];
    for (const w of banned) expect(all.toLowerCase()).not.toContain(w);
    expect(all).not.toContain(String.fromCharCode(0x2014));
  });
});
