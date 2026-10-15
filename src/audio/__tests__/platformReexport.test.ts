import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.web\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Value import/export statements that point at the file's own base name (resolves to itself on web). */
export function selfReferences(file: string, src: string): string[] {
  const base = basename(file).replace(/\.web\.tsx?$/, '');
  const stmt = /\b(import|export)\s+(type\s+)?([^;]*?)\s*from\s*['"]\.\/([^'"]+)['"]/gs;
  const bad: string[] = [];
  for (const m of src.matchAll(stmt)) {
    const target = m[4].replace(/\.(tsx?|js)$/, '');
    if (target !== base || m[2]) continue;
    const clause = m[3].replace(/\s+/g, ' ');
    // `import { type A, type B }` is erased too; anything else is a value binding.
    const braces = clause.match(/^\{(.*)\}$/);
    if (braces && braces[1].split(',').map((x) => x.trim()).filter(Boolean).every((x) => x.startsWith('type '))) continue;
    bad.push(m[0].replace(/\s+/g, ' '));
  }
  return bad;
}

describe('platform files do not value-import themselves', () => {
  const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))];

  it('finds web files', () => expect(files.length).toBeGreaterThan(0));

  it.each(files.map((f) => [f.slice(ROOT.length + 1), f]))('%s', (_n, f) => {
    expect(selfReferences(f, readFileSync(f, 'utf8'))).toEqual([]);
  });

  it('detector flags the original bug and ignores type-only', () => {
    expect(selfReferences('x/haptics.web.ts', "export { calmStyle } from './haptics';")).toHaveLength(1);
    expect(selfReferences('x/haptics.web.ts', "import { a } from './haptics';")).toHaveLength(1);
    expect(selfReferences('x/haptics.web.ts', "export type { A } from './haptics';\nimport type { B } from './haptics';")).toEqual([]);
  });
});
