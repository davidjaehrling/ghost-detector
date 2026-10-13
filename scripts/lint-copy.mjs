#!/usr/bin/env node
// Banned-copy linter. Usage: node scripts/lint-copy.mjs [path ...]
// Default targets: app/, src/, locales/ (if present). Exits 1 on any hit.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BANNED = ['delve', 'tapestry', 'pivotal', 'crucial', 'intricate', 'testament', 'foster', 'landscape', 'underscore'];
const wordRe = new RegExp(`\\b(${BANNED.join('|')})\\b`, 'i');
const EM_DASH = '—';

function* walk(p) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const name of readdirSync(p)) {
      if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
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
