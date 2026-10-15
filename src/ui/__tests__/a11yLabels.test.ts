import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANGS, resourcesOf, translate } from '../../i18n/core';
import '../../i18n/testSetup';

// P8-04 clause 1. Walks every key slot in the screens (`testID: 'key-...', label: X.field, legend: ...`):
// the accessible label of a hardware key must resolve to a non-empty string in each locale, from that
// locale's own file. The rendered roles and names are scanned in a browser by e2e/web/a11y.spec.ts.

const root = join(__dirname, '..', '..', '..');

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name)) yield p;
  }
}

const files = [...walk(join(root, 'app')), ...walk(join(root, 'src'))];
const sources = files.map((f) => ({ f, src: readFileSync(f, 'utf8') }));

// field name -> every i18n key a copy table binds it to (`field: 'a.b'` or `get field() { return t('a.b') }`).
const bound = new Map<string, Set<string>>();
const bind = (field: string, key: string) => bound.set(field, (bound.get(field) ?? new Set()).add(key));
for (const { src } of sources) {
  for (const m of src.matchAll(/\b(\w+):\s*'([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)'/g)) bind(m[1]!, m[2]!);
  for (const m of src.matchAll(/get (\w+)\(\)\s*\{\s*return t\('([^']+)'\)/g)) bind(m[1]!, m[2]!);
  for (const m of src.matchAll(/\b(\w+):\s*\(\)\s*=>\s*t\('([^']+)'\)/g)) bind(m[1]!, m[2]!);
}

type Slot = { file: string; testID: string; field: string };
const slots: Slot[] = [];
for (const { f, src } of sources) {
  for (const m of src.matchAll(/testID:\s*'((?:key|share|relay)-[\w-]+)',\s*label:\s*(\w+)\.(\w+)/g)) {
    slots.push({ file: f.slice(root.length + 1), testID: m[1]!, field: m[3]! });
  }
}

describe('hardware key labels', () => {
  it('finds the key slots (a vacuous walk fails)', () => {
    expect(slots.length).toBeGreaterThanOrEqual(20);
    for (const id of ['key-capture', 'key-log', 'key-back', 'key-share', 'key-therm', 'key-acknowledge', 'key-reset', 'key-cancel', 'share-916', 'share-11', 'relay-fit', 'relay-notnow']) {
      expect(slots.map((s) => s.testID), id).toContain(id);
    }
  });

  for (const lang of LANGS) {
    it(`every slot label resolves to a non-empty ${lang} string from the ${lang} file`, () => {
      const dict = resourcesOf(lang);
      const missing: string[] = [];
      for (const s of slots) {
        const keys = bound.get(s.field);
        if (!keys) {
          missing.push(`${s.file} ${s.testID}: no copy key bound to ${s.field}`);
          continue;
        }
        for (const k of keys) {
          if (!dict[k] || translate(lang, k).trim() === '') missing.push(`${s.file} ${s.testID}: ${k} empty in ${lang}`);
        }
      }
      expect(missing).toEqual([]);
    });
  }

  it('the Key component gives every slot a button role and its label', () => {
    const parts = readFileSync(join(root, 'src/ui/boot/parts.tsx'), 'utf8');
    const key = parts.slice(parts.indexOf('export const Key = memo'));
    expect(key).toContain('accessibilityRole="button"');
    expect(key).toContain('accessibilityLabel={label}');
  });
});
