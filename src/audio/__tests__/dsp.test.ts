import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg, dbToLin } from '../config';
import { limiterCurve, peakOf, renderClick, renderNoise, renderScareNoise, renderThump, scareEnvelope } from '../dsp';

describe('dsp', () => {
  it('click lengths follow the variant and peak at 1', () => {
    const c = renderClick(cfg, 1.5, 1);
    expect(c.length).toBe(72);
    expect(peakOf(c)).toBeCloseTo(1, 5);
    expect(renderClick(cfg, 1.5, 1)).toEqual(c);
  });
  it('limiter curve never exceeds the -6 dBFS ceiling and is linear when quiet', () => {
    const lim = dbToLin(-6);
    const c = limiterCurve(lim);
    expect(peakOf(c)).toBeLessThanOrEqual(lim + 1e-6);
    expect(c[0]).toBeCloseTo(-lim, 3);
    expect(c[Math.round(((0.1 + 1) / 2) * (c.length - 1))]).toBeCloseTo(0.1, 2);
  });
  it('scare envelope: 8 ms attack, hold to 98 ms, -40 dB at the end', () => {
    expect(scareEnvelope(cfg, 0.004)).toBeCloseTo(0.5, 5);
    expect(scareEnvelope(cfg, 0.05)).toBe(1);
    expect(scareEnvelope(cfg, 0.5)).toBeCloseTo(0.01, 3);
    expect(scareEnvelope(cfg, 0.6)).toBe(0);
  });
  it('scare noise is 500 ms, bit-crushed, peak at most 1', () => {
    const n = renderScareNoise(cfg, 3);
    expect(n.length).toBe(24000);
    expect(peakOf(n)).toBeLessThanOrEqual(1);
    expect(new Set(Array.from(n.slice(0, 4000), (v) => Math.round(v * 128))).size).toBeLessThanOrEqual(256);
  });
  it('noise and thump render with unit peaks', () => {
    expect(peakOf(renderNoise(48000, 0.2, true, 1))).toBeCloseTo(1, 5);
    expect(renderThump(cfg).length).toBe(576);
  });
});
