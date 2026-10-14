import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..', '..');
const FONTS = {
  VT323_400Regular: 'vt323/400Regular/VT323_400Regular.ttf',
  B612Mono_400Regular: 'b612-mono/400Regular/B612Mono_400Regular.ttf',
  B612Mono_700Bold: 'b612-mono/700Bold/B612Mono_700Bold.ttf',
};

/** The code points a TrueType font maps, from its best Unicode cmap subtable (format 4 or 12). */
export function cmapCodePoints(buf: Buffer): Set<number> {
  const numTables = buf.readUInt16BE(4);
  let cmapAt = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (buf.toString('ascii', rec, rec + 4) === 'cmap') cmapAt = buf.readUInt32BE(rec + 8);
  }
  if (cmapAt < 0) throw new Error('no cmap table');
  const subs: { off: number; fmt: number; score: number }[] = [];
  const n = buf.readUInt16BE(cmapAt + 2);
  for (let i = 0; i < n; i++) {
    const plat = buf.readUInt16BE(cmapAt + 4 + i * 8);
    const enc = buf.readUInt16BE(cmapAt + 6 + i * 8);
    const off = cmapAt + buf.readUInt32BE(cmapAt + 8 + i * 8);
    const fmt = buf.readUInt16BE(off);
    const unicode = plat === 0 || (plat === 3 && (enc === 1 || enc === 10));
    if (unicode && (fmt === 4 || fmt === 12)) subs.push({ off, fmt, score: fmt === 12 ? 2 : 1 });
  }
  if (!subs.length) throw new Error('no Unicode cmap subtable');
  const { off, fmt } = subs.sort((a, b) => b.score - a.score)[0]!;
  const out = new Set<number>();
  if (fmt === 12) {
    const groups = buf.readUInt32BE(off + 12);
    for (let g = 0; g < groups; g++) {
      const at = off + 16 + g * 12;
      const lo = buf.readUInt32BE(at);
      const hi = buf.readUInt32BE(at + 4);
      const start = buf.readUInt32BE(at + 8);
      for (let c = lo; c <= hi; c++) if (start + (c - lo) > 0) out.add(c);
    }
    return out;
  }
  const segX2 = buf.readUInt16BE(off + 6);
  const ends = off + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  for (let s = 0; s < segX2 / 2; s++) {
    const end = buf.readUInt16BE(ends + s * 2);
    const start = buf.readUInt16BE(starts + s * 2);
    const delta = buf.readInt16BE(deltas + s * 2);
    const ro = buf.readUInt16BE(ranges + s * 2);
    for (let c = start; c <= end && c < 0xffff; c++) {
      let gid: number;
      if (ro === 0) gid = (c + delta) & 0xffff;
      else {
        const at = ranges + s * 2 + ro + (c - start) * 2;
        const raw = buf.readUInt16BE(at);
        gid = raw === 0 ? 0 : (raw + delta) & 0xffff;
      }
      if (gid !== 0) out.add(c);
    }
  }
  return out;
}

const localeFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? localeFiles(join(dir, d.name)) : d.name.endsWith('.json') ? [join(dir, d.name)] : [],
  );

const needed = new Set<number>([...'ãçñßüóúõªº°'].map((c) => c.codePointAt(0)!));
for (const f of localeFiles(join(root, 'locales'))) {
  for (const ch of readFileSync(f, 'utf8')) {
    const cp = ch.codePointAt(0)!;
    if (cp > 0x7e) needed.add(cp);
  }
}
// Text is shown upper-case in the instrument, so the upper-case forms are needed too.
for (const cp of [...needed]) for (const up of String.fromCodePoint(cp).toUpperCase()) if (up.codePointAt(0)! > 0x7e) needed.add(up.codePointAt(0)!);
// Typographic characters in the locale files are line breaks and the like, not glyphs.
for (const cp of [0x85, 0xa0, 0x2028, 0x2029, 0xfeff]) needed.delete(cp);

describe('font glyph coverage', () => {
  it('reads a plausible cmap (has A and ß, lacks a CJK ideograph)', () => {
    const cps = cmapCodePoints(readFileSync(join(root, 'node_modules/@expo-google-fonts', FONTS.VT323_400Regular)));
    expect(cps.has(0x41)).toBe(true);
    expect(cps.has(0xdf)).toBe(true);
    expect(cps.has(0x4e2d)).toBe(false);
    expect(needed.size).toBeGreaterThan(15);
  });
  for (const [face, rel] of Object.entries(FONTS)) {
    it(`${face} covers every non-ASCII character in locales/ and the ordinals`, () => {
      const cps = cmapCodePoints(readFileSync(join(root, 'node_modules/@expo-google-fonts', rel)));
      const missing = [...needed].filter((c) => !cps.has(c)).map((c) => `${String.fromCodePoint(c)} U+${c.toString(16).toUpperCase().padStart(4, '0')}`);
      expect(missing).toEqual([]);
    });
  }
});
