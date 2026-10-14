// Vitest setup: registers locales/*.json from disk (Metro does this with require.context).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANGS, registerResources } from './core';

const root = join(__dirname, '..', '..', 'locales');
for (const lang of LANGS) {
  const f = join(root, `${lang}.json`);
  if (existsSync(f)) registerResources(lang, JSON.parse(readFileSync(f, 'utf8')) as Record<string, string>);
  const e = join(root, 'engine', `${lang}.json`);
  if (existsSync(e)) registerResources(lang, JSON.parse(readFileSync(e, 'utf8')) as Record<string, string>, true);
}
