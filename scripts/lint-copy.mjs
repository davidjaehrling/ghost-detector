#!/usr/bin/env node
// Banned-copy linter. Usage: node scripts/lint-copy.mjs [path ...]
// Default targets: app/, src/, locales/ (if present). Exits 1 on any hit.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Word lists come from scripts/claim-words.json (Compliance, D-038): per language `claim` and
// `framing` lists, plus `exempt` literals. An entry ending in `*` is a stem; matching is Unicode-aware
// (`\b` fails on accented letters) and case-insensitive; `exempt` matching is case-sensitive. Until the file exists the inline English
// lists below stand in.
const LANGS = ['en', 'de', 'es', 'pt'];
const FALLBACK = {
  en: {
    claim: ['verified*', 'confirmed*', 'accurate*', 'real', 'detected*'],
    framing: ['Warning*', 'Alert*', 'Alarm*', 'Detected*', 'System alert*', 'Danger*', 'Urgent*', 'Emergency*'],
  },
  exempt: [],
};
const listsPath = join(root, 'scripts', 'claim-words.json');
const haveLists = existsSync(listsPath);
const lists = haveLists ? JSON.parse(readFileSync(listsPath, 'utf8')) : FALLBACK;
const exempt = lists.exempt ?? [];

const escapeRe = (e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
/** Entries to one regex: `(?<![\p{L}])(?:a|b\p{L}*)(?![\p{L}])`, flags `iu`. */
export function listRe(entries) {
  const alts = entries.map((e) => (e.endsWith('*') ? `${escapeRe(e.slice(0, -1))}\\p{L}*` : escapeRe(e)));
  return new RegExp(String.raw`(?<![\p{L}])(?:${alts.join('|')})(?![\p{L}])`, 'iu');
}

let hits = 0;
const fail = (msg) => {
  console.error(msg);
  hits++;
};
// A language list may not be empty: an empty list would pass everything.
for (const lang of haveLists ? LANGS : ['en']) {
  for (const kind of ['claim', 'framing']) {
    if (!Array.isArray(lists[lang]?.[kind]) || lists[lang][kind].length === 0) fail(`lint-copy: empty ${kind} list for "${lang}"`);
  }
}
const claimRe = Object.fromEntries(LANGS.filter((l) => lists[l]?.claim?.length).map((l) => [l, listRe(lists[l].claim)]));
const framingListRe = Object.fromEntries(LANGS.filter((l) => lists[l]?.framing?.length).map((l) => [l, listRe(lists[l].framing)]));

// Exemption matching is case-sensitive. `re:` entries are regexes tried on each whitespace-separated
// token (and on the whole trimmed text); plain entries are literals.
const exemptRes = exempt.filter((e) => e.startsWith('re:')).map((e) => new RegExp(e.slice(3), 'u'));
const exemptWords = exempt.filter((e) => !e.startsWith('re:'));
const exemptWordRe = exemptWords.length ? new RegExp(exemptWords.map(escapeRe).join('|'), 'gu') : null;
/** The text with exempt literals (tier names, codes, units, the negations) taken out. */
function withoutExempt(text) {
  const t = text.trim();
  if (exemptRes.some((re) => re.test(t))) return '';
  const rest = exemptRes.length
    ? t.split(/\s+/).map((tok) => (exemptRes.some((re) => re.test(tok)) ? ' ' : tok)).join(' ')
    : text;
  return exemptWordRe ? rest.replace(exemptWordRe, ' ') : rest;
}

// Banned AI-tell words (plan section 6), English and ASCII, so \b is safe. The engine test reads this line.
const wordRe = /\b(delv\w*|tapestr\w*|pivotal\w*|crucial\w*|intricat\w*|testament\w*|foster\w*|landscape\w*|underscor\w*)\b/i;
// Claim words (D-028, D-032): user-facing strings must not say a reading is verified, confirmed,
// accurate, real or detected. Checked only inside quoted strings of source files; comments, docs and
// test files are not user-facing. A single lowercase word (an identifier-like literal) is skipped.
const CODE_FILE = /\.(tsx?|jsx?|mjs|json)$/;
const TEST_FILE = /(__tests__|\.test\.|\.spec\.)/;
const literalRe = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
function claimInStrings(line) {
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return null;
  for (const m of line.matchAll(literalRe)) {
    const text = m[1] ?? m[2] ?? m[3] ?? '';
    const hit = withoutExempt(text).match(claimRe.en);
    if (!hit) continue;
    if (/\s/.test(text) || text === text.toUpperCase()) return hit[0];
  }
  return null;
}
// Locale files: `"key": "value"` per line. The claim list of the file's language runs over every
// value; the framing list runs over notification templates, the channel name and prompts.
const LOCALE_FILE = /locales[\\/](?:engine[\\/])?(en|de|es|pt)\.json$/;
const FRAMING_KEY = /^(?:engine\.)?notify\.|^relay\.|^viewfinder\.permission\./;
const entryRe = /^\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/;
function localeHits(lang, line) {
  const m = line.match(entryRe);
  if (!m) return [];
  const key = m[1];
  const value = m[2].replace(/\\n/g, ' ').replace(/\\(.)/g, '$1');
  const out = [];
  const claim = withoutExempt(value).match(claimRe[lang] ?? claimRe.en);
  if (claim) out.push(`claim word "${claim[0]}"`);
  if (FRAMING_KEY.test(key)) {
    const fr = withoutExempt(value).match(framingListRe[lang] ?? framingListRe.en);
    if (fr) out.push(`framing word "${fr[0]}"`);
  }
  return out;
}
const framingRe = /\bnot\s+(?:just|only|merely)?\s*\w+(?:\s+\w+){0,3},?\s+but\s+(?:rather\s+)?\w+/i;
const SKIP_DOT = new Set(['.git', '.expo', '.github', '.claude']);
const EM_DASH = '—';

function* walk(p) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const name of readdirSync(p)) {
      if (name === 'node_modules' || name === '__fixtures__') continue;
      if (SKIP_DOT.has(name)) continue;
      yield* walk(join(p, name));
    }
  } else {
    yield p;
  }
}

const args = process.argv.slice(2);
const targets = (args.length ? args : ['app', 'src', 'locales'].map((d) => join(root, d))).filter(existsSync);

for (const target of targets) {
  for (const file of walk(target)) {
    if (/\.(png|jpe?g|webp|gif|ttf|otf|woff2?|mp3|ogg|wav|m4a)$/i.test(file)) continue;
    readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
      const m = line.match(wordRe);
      if (m) fail(`${file}:${i + 1}: banned word "${m[0]}"`);
      const loc = file.match(LOCALE_FILE);
      if (loc) {
        for (const msg of localeHits(loc[1], line)) fail(`${file}:${i + 1}: ${msg}`);
      } else if (CODE_FILE.test(file) && !TEST_FILE.test(file)) {
        const claim = claimInStrings(line);
        if (claim) fail(`${file}:${i + 1}: claim word "${claim}"`);
      }
      if (framingRe.test(line)) fail(`${file}:${i + 1}: framing "not X, but Y"`);
      if (line.includes(EM_DASH)) fail(`${file}:${i + 1}: em-dash`);
    });
  }
}
if (hits) {
  console.error(`lint-copy: ${hits} hit(s)`);
  process.exit(1);
}
console.log('lint-copy: clean');
