import { describe, expect, it } from 'vitest';
import { captureSeed, photoHash } from '../../capture';
import { parsePhase, resolveHarness } from '../../harness';
import { createFluxWalk, fluxAngle, formatFlux, liveLeds, liveThermal } from '../flux';

describe('flux walk', () => {
  it('is deterministic per seed and bounded', () => {
    const a = createFluxWalk(417);
    const b = createFluxWalk(417);
    const c = createFluxWalk(418);
    const sa = Array.from({ length: 600 }, () => a.next());
    expect(Array.from({ length: 600 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 600 }, () => c.next())).not.toEqual(sa);
    for (const { mg, jitter } of sa) {
      expect(mg).toBeGreaterThanOrEqual(10);
      expect(mg).toBeLessThanOrEqual(2000);
      expect(Math.abs(jitter)).toBeLessThanOrEqual(1);
    }
  });

  it('maps flux to the 100 degree log arc', () => {
    expect(fluxAngle(10)).toBeCloseTo(-50, 5);
    expect(fluxAngle(2000)).toBeCloseTo(50, 5);
    expect(fluxAngle(5)).toBeCloseTo(-50, 5);
    expect(fluxAngle(100)).toBeLessThan(fluxAngle(1000));
  });

  it('formats the readout with fixed width', () => {
    expect(formatFlux(412)).toBe('FLUX  412 mG');
    expect(formatFlux(1010)).toBe('FLUX 1010 mG');
  });

  it('ladder: power LED at the GEO centre, LED 2 and 3 at 15% and 40% off it, never LED 5', () => {
    expect(liveLeds(400)).toBe(1);
    expect(liveLeds(345)).toBe(1);
    expect(liveLeds(459)).toBe(1);
    expect(liveLeds(460)).toBe(2);
    expect(liveLeds(340)).toBe(2);
    expect(liveLeds(560)).toBe(3);
    expect(liveLeds(240)).toBe(3);
    expect(liveLeds(700)).toBe(4);
    expect(liveLeds(2000)).toBe(4);
    for (let mg = 10; mg <= 2000; mg += 10) expect(liveLeds(mg)).toBeLessThanOrEqual(4);
  });

  it('thermal stays in range and dips with the field', () => {
    expect(liveThermal(400)).toBe(-0.3);
    expect(liveThermal(2000)).toBeLessThan(liveThermal(800));
    for (let mg = 10; mg <= 2000; mg += 10) {
      expect(liveThermal(mg)).toBeGreaterThanOrEqual(-12);
      expect(liveThermal(mg)).toBeLessThanOrEqual(6);
    }
  });
});

describe('capture hash', () => {
  it('hashes uri and size', () => {
    expect(photoHash('a.png', 768, 1024)).toMatch(/^[0-9a-f]{8}$/);
    expect(photoHash('a.png', 768, 1024)).toBe(photoHash('a.png', 768, 1024));
    expect(photoHash('a.png', 768, 1024)).not.toBe(photoHash('a.png', 1024, 768));
    expect(photoHash('a.png', 1, 1)).not.toBe(photoHash('b.png', 1, 1));
  });
  it('seed depends on time', () => {
    expect(captureSeed('a', 1, 1, 1000)).not.toBe(captureSeed('a', 1, 1, 1001));
    expect(captureSeed('a', 1, 1, 1000)).toBe(captureSeed('a', 1, 1, 1000));
  });
});

describe('harness params', () => {
  it('parses phases', () => {
    expect(parsePhase('2')).toBe(2);
    expect(parsePhase('hold')).toBe('hold');
    expect(parsePhase('9')).toBeNull();
    expect(parsePhase(undefined)).toBeNull();
  });
  it('keeps static, fixture and speed sticky but not phase', () => {
    const state = { isStatic: false, fixture: null, speed: 1 } as Parameters<typeof resolveHarness>[1];
    expect(resolveHarness({ static: '1', fixture: 'attic', speed: '20', phase: '1' }, state)).toEqual({
      isStatic: true, fixture: 'attic', speed: 20, phase: 1,
    });
    expect(resolveHarness({}, state)).toEqual({ isStatic: true, fixture: 'attic', speed: 20, phase: null });
    expect(resolveHarness({ fixture: 'nope' }, state).fixture).toBe('attic');
  });
});
