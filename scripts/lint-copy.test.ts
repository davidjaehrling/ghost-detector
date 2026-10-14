import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const run = (path: string) => spawnSync('node', ['scripts/lint-copy.mjs', path], { encoding: 'utf8' });

describe('lint-copy', () => {
  it('fails on the banned fixture with file:line', () => {
    const r = run('scripts/__fixtures__/banned.txt');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('banned.txt:1');
  });

  it('reports stems and the not-X-but-Y framing', () => {
    const r = run('scripts/__fixtures__/banned.txt');
    expect(r.stderr).toContain('banned.txt:2: banned word "delving"');
    expect(r.stderr).toContain('banned.txt:3: banned word "underscores"');
    expect(r.stderr).toContain('banned.txt:4: framing "not X, but Y"');
  });

  it('flags claim words inside user-facing strings only', () => {
    const r = run('scripts/__fixtures__/claims.ts');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('claims.ts:1: claim word "confirmed"');
    expect(r.stderr).toContain('claims.ts:2: claim word "DETECTED"');
    expect(r.stderr).not.toContain('claims.ts:3');
    expect(r.stderr).not.toContain('claims.ts:4');
    expect(r.stderr).not.toContain('claims.ts:5');
  });

  it('passes on app/', () => {
    expect(run('app').status).toBe(0);
  });
});
