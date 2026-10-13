import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  INTENSITIES,
  MAX_HAPTIC_MS,
  TIER_ORDER,
  clampFlashes,
  humF0,
  patternMs,
  resolveConfig,
} from '../config';

describe('config tables', () => {
  it('has every tier and intensity, rates rising with tier', () => {
    for (const i of INTENSITIES) {
      let prev = 0;
      for (const t of TIER_ORDER) {
        const r = DEFAULT_CONFIG.geiger.ratePerSec[t][i];
        expect(r).toBeGreaterThan(prev);
        prev = r;
      }
    }
  });
  it('CRITICAL rates are the psych-brief caps 6, 14, 22', () => {
    const c = DEFAULT_CONFIG.geiger.ratePerSec.critical;
    expect([c.calm, c.standard, c.brave]).toEqual([6, 14, 22]);
  });
  it('static and hum tables match the palette', () => {
    expect(TIER_ORDER.map((t) => DEFAULT_CONFIG.static.centreHz[t])).toEqual([1800, 2200, 2600, 3000, 3400]);
    expect(DEFAULT_CONFIG.hum.harmonics.map((h) => h.db)).toEqual([0, -6, -10, -16]);
    expect(humF0(DEFAULT_CONFIG, 'us')).toBe(60);
    expect(humF0(DEFAULT_CONFIG, 'DE')).toBe(50);
    expect(humF0(DEFAULT_CONFIG)).toBe(50);
  });
  it('every default haptic pattern is at most 120 ms (summed durations)', () => {
    for (const [event, steps] of Object.entries(DEFAULT_CONFIG.haptics)) {
      expect(steps.length, event).toBeGreaterThan(0);
      expect(patternMs(steps), event).toBeLessThanOrEqual(MAX_HAPTIC_MS);
    }
  });
});

describe('clamps', () => {
  it('scare duration 400 to 600 ms', () => {
    expect(resolveConfig({ scare: { durationMs: 100 } }).scare.durationMs).toBe(400);
    expect(resolveConfig({ scare: { durationMs: 9000 } }).scare.durationMs).toBe(600);
    expect(resolveConfig({ scare: { durationMs: 500 } }).scare.durationMs).toBe(500);
  });
  it('scare peak and master ceiling never above -6 dBFS', () => {
    const c = resolveConfig({ scare: { peakDbfs: 0 }, masterCeilingDbfs: -1 });
    expect(c.masterCeilingDbfs).toBe(-6);
    expect(c.scare.peakDbfs).toBeLessThanOrEqual(-6);
    expect(resolveConfig({ scare: { peakDbfs: -20 } }).scare.peakDbfs).toBe(-20);
  });
  it('at most 3 flashes in any second', () => {
    expect(clampFlashes([0, 100, 200, 300, 400])).toEqual([0, 100, 200]);
    expect(clampFlashes([0, 260, 1100, 1300, 1500, 1700])).toEqual([0, 260, 1100, 1300, 1500]);
  });
  it('drops haptic transients that run past 120 ms', () => {
    const c = resolveConfig({
      haptics: { scanStart: [{ kind: 'impact', style: 'heavy', atMs: 0 }, { kind: 'impact', style: 'heavy', atMs: 110 }] },
    });
    expect(c.haptics.scanStart).toHaveLength(1);
  });
  it('hold not below 1000 ms, refractory not below 12 ms, click length 1 to 3 ms', () => {
    const c = resolveConfig({ holdMs: 100, geiger: { refractoryMs: 2, clickMs: [0.1, 40] } });
    expect(c.holdMs).toBe(1000);
    expect(c.geiger.refractoryMs).toBe(12);
    expect(c.geiger.clickMs).toEqual([1, 3]);
  });
  it('does not mutate the defaults', () => {
    resolveConfig({ scare: { durationMs: 600 } });
    expect(DEFAULT_CONFIG.scare.durationMs).toBe(500);
  });
});
