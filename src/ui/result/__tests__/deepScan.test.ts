import { describe, expect, it } from 'vitest';
import { placeGhost } from '../../../fx/ghostV0/placement';
import { HIRES_SCALE, deepCopy, evpLine, scalePlacement } from '../deepCopy';

const BANNED = [/\bfree\b/i, /unlock now/i, /tap to continue/i, /continue scan/i, /\breal\b/i, /\btruer\b/i, /\baccurate\b/i, /\bactual\b/i];

describe('DEEP SCAN copy', () => {
  it('carries the sublabel and the offline line exactly', () => {
    expect(deepCopy.sub).toBe('SPONSORED VIDEO PLAYS FIRST');
    expect(deepCopy.offline).toBe('DEEP SCAN OFFLINE. NO SIGNAL.');
  });
  it('uses none of the banned phrases and claims no real or truer reading', () => {
    for (const text of Object.values(deepCopy)) for (const re of BANNED) expect(text).not.toMatch(re);
    for (const line of Array.from({ length: 48 }, (_, i) => evpLine(i))) for (const re of BANNED) expect(line).not.toMatch(re);
  });
});

describe('evpLine', () => {
  it('is a pure function of the seed', () => {
    expect(evpLine(1234)).toBe(evpLine(1234));
    expect(new Set(Array.from({ length: 48 }, (_, i) => evpLine(i))).size).toBeGreaterThan(6);
  });
  it('fits the EVP row (30 characters or fewer)', () => {
    for (let i = 0; i < 48; i++) expect(evpLine(i).length).toBeLessThanOrEqual(30);
  });
});

describe('scalePlacement', () => {
  const region = { x: 0.1, y: 0.4, w: 0.4, h: 0.4, cx: 0.3, cy: 0.6, areaFraction: 0.16 };
  const p = placeGhost(region, { w: 300, h: 400 }, 7, { tier: 'critical' });
  it('multiplies every pixel field and keeps opacity, flip and alphas', () => {
    const q = scalePlacement(p, HIRES_SCALE);
    expect([q.x, q.y, q.w, q.h]).toEqual([p.x * 2, p.y * 2, p.w * 2, p.h * 2]);
    expect(q.opacity).toBe(p.opacity);
    expect(q.flipX).toBe(p.flipX);
    expect(q.offsetCopies.map((c) => c.alpha)).toEqual(p.offsetCopies.map((c) => c.alpha));
    expect(q.offsetCopies.map((c) => c.dx)).toEqual(p.offsetCopies.map((c) => c.dx * 2));
    if (p.echo) expect(q.echo?.dy).toBe(p.echo.dy * 2);
  });
});
