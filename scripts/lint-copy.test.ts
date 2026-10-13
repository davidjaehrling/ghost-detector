import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const run = (path: string) => spawnSync('node', ['scripts/lint-copy.mjs', path], { encoding: 'utf8' });

describe('lint-copy', () => {
  it('fails on the banned fixture with file:line', () => {
    const r = run('scripts/__fixtures__/banned.txt');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('banned.txt:1');
  });

  it('passes on app/', () => {
    expect(run('app').status).toBe(0);
  });
});
