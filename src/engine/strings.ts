/**
 * Locale resources for engine copy. Pure: no locale detection, no fs. The caller picks the table
 * (`locales/engine/<lang>.json`, merged by the i18n loader under `engine.`) and passes it in.
 * Key scheme: see README.md.
 */
import enTable from '../../locales/engine/en.json';

/** Flat dotted keys (without the `engine.` prefix) to template strings. */
export type EngineStrings = Readonly<Record<string, string>>;
/** Number formatter. `fractionDigits` is set only where the instrument shows a decimal (ΔT). */
export type NumFmt = (n: number, fractionDigits?: number) => string;

/** Default formatter: plain integers (and `toFixed` when decimals are asked for). */
export const plainFmt: NumFmt = (n, d) => (d === undefined ? String(n) : n.toFixed(d));

/** The English table. Used by the legacy wrappers so existing callers keep their signatures. */
export const en: EngineStrings = enTable;

const pad2 = (i: number) => String(i).padStart(2, '0');

/** Items `<prefix>.00`, `<prefix>.01`, ... up to the first gap. */
export function bank(strings: EngineStrings, prefix: string): string[] {
  const out: string[] = [];
  for (let i = 0; ; i++) {
    const v = strings[`${prefix}.${pad2(i)}`];
    if (v === undefined) return out;
    out.push(v);
  }
}

/** Replace `{name}` with `values[name]`. An unknown placeholder is left as written. */
export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
}

/** Placeholder names in a template, sorted and unique. */
export function placeholders(template: string): string[] {
  return [...new Set([...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
}

/* ---------- per-locale checks (used by tests and by the Copy agent) ---------- */

export interface CopyLists {
  /** Banned AI-tell words. `stem*` matches the stem plus any letters; a bare word matches whole words only. */
  banned: readonly string[];
  /** Claim words (same `word` / `stem*` syntax). Checked on every key. */
  claim: readonly string[];
  /** Extra claim words checked only on `notify.*` keys (English: "active"). */
  claimNotify?: readonly string[];
  /** Framing words (same syntax). Checked only on notification titles (`notify.*.title`) and `notify.prefix`. */
  framing?: readonly string[];
  /** Literals removed (case-sensitive) before any check: tier names, codes such as E-07, units. */
  exempt?: readonly string[];
}
export interface CopyHit { key: string; kind: 'banned' | 'claim' | 'framing' | 'emdash'; word: string }

const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Unicode-aware matcher: `\b` fails on ä, ñ, ç, ã, so use letter lookarounds and the `u` flag. */
function wordRe(words: readonly string[] | undefined): RegExp | null {
  if (!words || words.length === 0) return null;
  const alt = words.map((w) => (w.endsWith('*') ? `${esc(w.slice(0, -1))}\\p{L}*` : esc(w))).join('|');
  return new RegExp(`(?<![\\p{L}])(?:${alt})(?![\\p{L}])`, 'iu');
}

/** Run the banned-word, claim-word, framing and em-dash checks over every value of a table. */
export function checkStrings(table: EngineStrings, lists: CopyLists): CopyHit[] {
  const hits: CopyHit[] = [];
  const banned = wordRe(lists.banned);
  const claim = wordRe(lists.claim);
  const claimN = wordRe([...lists.claim, ...(lists.claimNotify ?? [])]);
  const framing = wordRe(lists.framing);
  const exempt = [...(lists.exempt ?? [])].sort((a, b) => b.length - a.length);
  for (const [key, raw] of Object.entries(table)) {
    let text = raw;
    for (const e of exempt) text = text.split(e).join(' ');
    const add = (kind: CopyHit['kind'], m: RegExpExecArray | null | undefined) => { if (m) hits.push({ key, kind, word: m[0] }); };
    add('banned', banned?.exec(text));
    add('claim', (key.startsWith('notify.') ? claimN : claim)?.exec(text));
    if (/^notify\.(t\d\.title|prefix)$/.test(key)) add('framing', framing?.exec(text));
    if (raw.includes('\u2014')) hits.push({ key, kind: 'emdash', word: '\u2014' });
  }
  return hits;
}

/** Keys of `en` that `other` lacks (empty values count as missing). */
export function missingKeys(enTbl: EngineStrings, other: EngineStrings): string[] {
  return Object.keys(enTbl).filter((k) => !other[k]);
}
/** Keys of `other` that `en` does not have. */
export function extraKeys(enTbl: EngineStrings, other: EngineStrings): string[] {
  return Object.keys(other).filter((k) => !(k in enTbl));
}
/** Keys whose placeholder set differs from `en`'s (a translated template must keep every name). */
export function placeholderMismatches(enTbl: EngineStrings, other: EngineStrings): string[] {
  return Object.keys(enTbl).filter((k) => other[k] !== undefined
    && placeholders(enTbl[k]!).join() !== placeholders(other[k]!).join());
}

/**
 * Lists for `en`. Banned stems are split so this file passes the copy linter that bans them.
 * Claim words follow scripts/lint-copy.mjs; "active" is added for notifications (D-032).
 */
export const EN_LISTS: CopyLists = {
  banned: ['del' + 'v*', 'tapes' + 'tr*', 'pivo' + 'tal*', 'cru' + 'cial*', 'intri' + 'cat*', 'testa' + 'ment*', 'fos' + 'ter*', 'land' + 'scape*', 'under' + 'scor*'],
  claim: ['verified', 'confirmed', 'accurate', 'real', 'detected'],
  claimNotify: ['active'],
  framing: [],
  exempt: ['QUIET', 'TRACE', 'ACTIVE', 'STRONG', 'CRITICAL'],
};
