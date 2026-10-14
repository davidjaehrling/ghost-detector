import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANGS, resourcesOf, hasLanguage } from '../core';
import { DISCLOSURE_KEYS, markersFor } from '../disclosures';

const root = join(__dirname, '..', '..', '..');
const en = JSON.parse(readFileSync(join(root, 'locales', 'en.json'), 'utf8')) as Record<string, string>;
const PLURAL = /_(zero|one|two|few|many|other)$/;
const base = (k: string) => k.replace(PLURAL, '');

// Dynamic keys are forbidden except these prefixes (each is a closed set in en.json).
const DYNAMIC_ALLOWED = ['deep.evp.', 'tag.', 'settings.language.'];

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === 'testSetup.ts') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name)) yield p;
  }
}

const namespaces = new Set(Object.keys(en).map((k) => k.split('.')[0]!));
const used = new Set<string>();
const dynamic: { file: string; text: string }[] = [];
for (const dir of ['app', 'src']) {
  for (const file of walk(join(root, dir))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(['"`])([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)\1/g)) {
      if (namespaces.has(m[2]!.split('.')[0]!)) used.add(m[2]!);
    }
    for (const m of src.matchAll(/`([a-z][A-Za-z0-9]*\.[A-Za-z0-9_.]*)\$\{/g)) {
      if (namespaces.has(m[1]!.split('.')[0]!)) dynamic.push({ file, text: m[1]! });
    }
  }
}

describe('locales/en.json and the code', () => {
  it('every key used in code exists in en.json', () => {
    const have = new Set(Object.keys(en).map(base));
    const missing = [...used].filter((k) => !have.has(k) && !en[k]);
    expect(missing).toEqual([]);
  });

  it('dynamic keys only use the allowlisted prefixes', () => {
    const bad = dynamic.filter((d) => !DYNAMIC_ALLOWED.includes(d.text));
    expect(bad).toEqual([]);
  });

  it('every en.json key is referenced', () => {
    const unused = Object.keys(en).filter((k) => !used.has(base(k)) && !used.has(k) && !DYNAMIC_ALLOWED.some((p) => k.startsWith(p)));
    expect(unused).toEqual([]);
  });

  it('keeps the dotted flat shape and no engine. keys', () => {
    for (const [k, v] of Object.entries(en)) {
      expect(k).toMatch(/^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$/);
      expect(typeof v).toBe('string');
      expect(k.startsWith('engine.')).toBe(false);
    }
  });

  it('plural keys come in _one and _other pairs', () => {
    for (const k of Object.keys(en)) if (k.endsWith('_one')) expect(en[`${base(k)}_other`]).toBeDefined();
  });

  it('every placeholder is a bare word', () => {
    for (const v of Object.values(en)) for (const m of v.matchAll(/\{([^}]*)\}/g)) expect(m[1]).toMatch(/^\w+$/);
  });
});

describe('disclosure contract (D-038)', () => {
  it('every disclosure key exists in en', () => {
    for (const k of DISCLOSURE_KEYS) expect(en[k], k).toBeTypeOf('string');
  });
  for (const lang of LANGS) {
    it(`${lang}: disclosures carry their marker words${lang === 'en' ? '' : ' and differ from en'}`, () => {
      if (!hasLanguage(lang)) return; // runs over the files present
      const dict = resourcesOf(lang);
      const markers = markersFor(lang);
      for (const k of DISCLOSURE_KEYS) {
        expect(dict[k], `${lang} ${k} missing (disclosure keys do not fall back)`).toBeTypeOf('string');
        if (lang !== 'en') expect(dict[k], `${lang} ${k} equals en`).not.toBe(en[k]);
        for (const re of markers[k] ?? []) expect(dict[k], `${lang} ${k} lacks ${re}`).toMatch(re);
      }
    });
  }
});
