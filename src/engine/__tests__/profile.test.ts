import { describe, expect, it } from 'vitest';
import { generateProfile } from '../profile';
import { ATTACHMENT, BEHAVIOUR, CLASSES, DETAIL, PREFIXES, TEMPERAMENT, TIMING } from '../profileBank';
import { TIERS } from '../tiers';

describe('generateProfile', () => {
  it('is deterministic', () => {
    for (let s = 0; s < 200; s++) expect(generateProfile(s, 'active', ['X-1'])).toEqual(generateProfile(s, 'active', ['X-1']));
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
