import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const script = join(__dirname, '../../../scripts/check-ad-ids.mjs');
const dir = mkdtempSync(join(tmpdir(), 'adids-'));
const sample = ['ca-app-pub-', '39402560', '99942544', '~1'].join('');
writeFileSync(join(dir, 'app.json'), JSON.stringify({ id: sample }));
const clean = mkdtempSync(join(tmpdir(), 'adids-'));
writeFileSync(join(clean, 'app.json'), JSON.stringify({ id: 'ca-app-pub-1111111111111111~2' }));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(clean, { recursive: true, force: true });
});

const run = (path: string, env: Record<string, string>) => spawnSync('node', [script, path], { env: { ...process.env, EXPO_PUBLIC_RELEASE: '', ...env }, encoding: 'utf8' });

describe('release gate for the sample publisher ID', () => {
  it('passes in dev mode with the sample ID present', () => expect(run(dir, {}).status).toBe(0));
  it('fails in release mode with the sample ID present', () => {
    const r = run(dir, { EXPO_PUBLIC_RELEASE: '1' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('app.json:1');
  });
  it('passes in release mode with a real ID', () => expect(run(clean, { EXPO_PUBLIC_RELEASE: '1' }).status).toBe(0));
});
