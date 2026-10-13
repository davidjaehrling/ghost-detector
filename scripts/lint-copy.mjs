#!/usr/bin/env node
// Banned-copy linter. Usage: node scripts/lint-copy.mjs [path ...]
// Default targets: app/, src/, locales/ (if present). Exits 1 on any hit.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wordRe = /\b(delv\w*|tapestr\w*|pivotal\w*|crucial\w*|intricat\w*|testament\w*|foster\w*|landscape\w*|underscor\w*)\b/i;
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

let hits = 0;
for (const target of targets) {
  for (const file of walk(target)) {
    if (/\.(png|jpe?g|webp|gif|ttf|otf|woff2?|mp3|ogg|wav|m4a)$/i.test(file)) continue;
    readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
      const m = line.match(wordRe);
      if (m) {
        console.error(`${file}:${i + 1}: banned word "${m[1]}"`);
        hits++;
      }
      if (framingRe.test(line)) {
        console.error(`${file}:${i + 1}: framing "not X, but Y"`);
        hits++;
      }
      if (line.includes(EM_DASH)) {
        console.error(`${file}:${i + 1}: em-dash`);
        hits++;
      }
    });
  }
}
if (hits) {
  console.error(`lint-copy: ${hits} hit(s)`);
  process.exit(1);
}
console.log('lint-copy: clean');
