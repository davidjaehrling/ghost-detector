import { describe, expect, it } from 'vitest';
import { captureSeed, photoHash } from '../../capture';
import { parsePhase, resolveHarness } from '../../harness';
import { needle } from '../../tokens';
import {
  ARC_DEG,
  JITTER_DEG,
  createFluxWalk,
  dampingRatio,
  fluxAngle,
  formatFlux,
  formatGeo,
  geoDeviation,
  jitteredAngle,
  liveLeds,
  liveThermal,
  magnitudeUt,
  microTeslaToMilliGauss,
  quantizeMg,
  sampleFromVector,
} from '../flux';

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

  it('the GEO line and the ladder move together', () => {
    expect(formatGeo(444)).toBe('GEO +11%');
    expect(formatGeo(400)).toBe('GEO +0%');
    expect(formatGeo(240)).toBe('GEO -40%');
    for (let mg = 10; mg <= 2000; mg += 5) {
      const d = Math.abs(geoDeviation(mg));
      const expected = 1 + [15, 40, 75].filter((t) => d >= t).length;
      expect(liveLeds(mg)).toBe(expected);
    }
    // The ladder steps exactly where the shown percentage crosses 15, 40 and 75.
    expect(liveLeds(459)).toBe(1);
    expect(liveLeds(460)).toBe(2);
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

describe('magnetometer mapping (P4-05)', () => {
  it('converts microtesla to milligauss at 10 to 1', () => {
    expect(microTeslaToMilliGauss(1)).toBe(10);
    expect(microTeslaToMilliGauss(48.2)).toBeCloseTo(482, 6);
    expect(magnitudeUt({ x: 3, y: 4, z: 12 })).toBe(13);
  });

  it("Earth's field (25 to 65 uT) lands on the GEO band 250 to 650 mG", () => {
    expect(sampleFromVector({ x: 0, y: 0, z: -25 }, 0).mg).toBe(250);
    expect(sampleFromVector({ x: 20, y: 0, z: -48 }, 0).mg).toBe(520);
    expect(sampleFromVector({ x: 0, y: 0, z: 65 }, 0).mg).toBe(650);
  });

  it('quantizes to 1 mG below 1000, 10 mG above, and pegs at 0 and 2000', () => {
    expect(quantizeMg(412.4)).toBe(412);
    expect(quantizeMg(999.6)).toBe(1000);
    expect(quantizeMg(1234)).toBe(1230);
    expect(quantizeMg(1236)).toBe(1240);
    expect(quantizeMg(5000)).toBe(2000);
    expect(quantizeMg(-3)).toBe(0);
  });

  it('draws the needle on the log arc, 10 to 2000 mG over 100 degrees, one decade per 43.5 degrees', () => {
    expect(fluxAngle(10)).toBeCloseTo(-ARC_DEG / 2, 9);
    expect(fluxAngle(2000)).toBeCloseTo(ARC_DEG / 2, 9);
    expect(fluxAngle(100) - fluxAngle(10)).toBeCloseTo(ARC_DEG / Math.log10(200), 9);
    expect(fluxAngle(1000) - fluxAngle(100)).toBeCloseTo(fluxAngle(100) - fluxAngle(10), 9);
    // Below 10 mG the needle rests on its stop.
    expect(fluxAngle(0)).toBe(fluxAngle(10));
  });

  it('jitters by at most 0.6% of full scale, and not at all under reduced motion', () => {
    expect(JITTER_DEG).toBeCloseTo(0.6, 9);
    expect(jitteredAngle(400, 1) - fluxAngle(400)).toBeCloseTo(0.6, 9);
    expect(jitteredAngle(400, -1) - fluxAngle(400)).toBeCloseTo(-0.6, 9);
    expect(jitteredAngle(400, 7) - fluxAngle(400)).toBeCloseTo(0.6, 9);
    expect(jitteredAngle(400, 1, true)).toBe(fluxAngle(400));
  });

  it('uses the Bible live spring: m 1, k 64, c 11.2 (8 rad/s, ratio 0.70)', () => {
    expect(needle.live).toEqual({ mass: 1, stiffness: 64, damping: 11.2 });
    expect(Math.sqrt(needle.live.stiffness / needle.live.mass)).toBe(8);
    expect(dampingRatio(needle.live)).toBeCloseTo(0.7, 9);
    expect(dampingRatio(needle.reveal)).toBeCloseTo(0.45, 2);
  });

  it('LED thresholds sit at 15, 40 and 75% off the GEO centre', () => {
    const at = (pct: number) => liveLeds(400 * (1 + pct / 100));
    expect([0, 14, 15, 39, 40, 74, 75, 150].map(at)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(liveLeds(400 * (1 - 0.15))).toBe(2);
    expect(liveLeds(400 * (1 - 0.4))).toBe(3);
    expect(liveLeds(400 * (1 - 0.75))).toBe(4);
  });

  it('reports the GEO deviation in whole percent, signed', () => {
    expect(geoDeviation(400)).toBe(0);
    expect(geoDeviation(520)).toBe(30);
    expect(geoDeviation(280)).toBe(-30);
    expect(geoDeviation(2000)).toBe(400);
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
