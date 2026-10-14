#!/usr/bin/env node
// Release gate (P5-01): Google's sample publisher ID (3940256099942544) must not ship.
// Default mode passes and reports where the sample ID still is, so CI stays green on test IDs.
// Release mode (EXPO_PUBLIC_RELEASE=1 or --release) fails on any hit in app.json, eas.json or src/.
// Run it from the production build path (eas.json production profile env, or a prebuild hook).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE = '3940256099942544';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const release = process.env.EXPO_PUBLIC_RELEASE === '1' || process.argv.includes('--release');
const targets = process.argv.slice(2).filter((a) => !a.startsWith('--'));

function* walk(p) {
  if (statSync(p).isDirectory()) {
    for (const name of readdirSync(p)) {
      if (name === 'node_modules' || name === '__fixtures__') continue;
      yield* walk(join(p, name));
    }
  } else yield p;
}

const paths = (targets.length ? targets : ['app.json', 'eas.json', 'src'].map((t) => join(root, t))).filter(existsSync);
const hits = [];
for (const p of paths) {
  for (const f of walk(p)) {
    if (/\.(png|jpe?g|webp|gif|ttf|otf|woff2?|mp3|ogg|wav|m4a|wasm)$/i.test(f)) continue;
    readFileSync(f, 'utf8')
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (line.includes(SAMPLE)) hits.push(`${relative(root, f)}:${i + 1}`);
      });
  }
}

if (release && hits.length) {
  console.error(`check-ad-ids: release build contains Google's sample publisher ID:\n  ${hits.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-ad-ids: ${release ? 'release' : 'dev'} mode, ${hits.length} sample ID hit(s)${release ? '' : ' (allowed until launch)'}`);
