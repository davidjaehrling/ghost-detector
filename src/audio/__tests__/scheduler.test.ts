import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg, INTENSITIES, TIER_ORDER } from '../config';
import {
  baseRate,
  breakthroughAtPhase,
  clickDt,
  createClickScheduler,
  glideAt,
  graticuleCrossings,
  scanCues,
  scanRate,
  scareWindow,
  simulateClicks,
  variantDurationsMs,
  wobble,
} from '../scheduler';

/** docs/sound-palette.md section 2, clicks per second (calm, standard, brave). Hard-coded on purpose. */
const PALETTE_RATES = {
  quiet: { calm: 0.5, standard: 0.8, brave: 1.0 },
  trace: { calm: 1.5, standard: 2.5, brave: 3.5 },
  active: { calm: 3, standard: 6, brave: 9 },
  strong: { calm: 5, standard: 10, brave: 16 },
  critical: { calm: 6, standard: 14, brave: 22 },
} as const;

describe('Poisson clicks', () => {
  it('config rates equal the palette table', () => {
    expect(cfg.geiger.ratePerSec).toEqual(PALETTE_RATES);
  });
  it('expected count over 10 s within 15% for every tier and intensity (mean of 300 seeds)', () => {
    for (const t of TIER_ORDER) {
      for (const i of INTENSITIES) {
        const rate = PALETTE_RATES[t][i];
        expect(baseRate(cfg, t, i), `${t}/${i} baseRate`).toBe(rate);
        let total = 0;
        for (let s = 1; s <= 300; s++) total += simulateClicks(cfg, s, rate, 10).length;
        const mean = total / 300;
        expect(Math.abs(mean - rate * 10) / (rate * 10), `${t}/${i}`).toBeLessThanOrEqual(0.15);
      }
    }
  });
  it('a single 10 s run at each CRITICAL cap stays near the cap', () => {
    for (const [i, cap] of [['calm', 6], ['standard', 14], ['brave', 22]] as const) {
      const n = simulateClicks(cfg, 7, PALETTE_RATES.critical[i], 10).length;
      expect(n).toBeGreaterThan(cap * 10 * 0.75);
      expect(n).toBeLessThan(cap * 10 * 1.25);
    }
  });
  it('respects the 12 ms refractory floor, even at an extreme rate and with bursts', () => {
    const s = createClickScheduler(cfg, 3);
    s.burst(0.5, 3, 200);
    const ev = s.advance(10, () => 60);
    for (let k = 1; k < ev.length; k++) expect(ev[k]!.t - ev[k - 1]!.t).toBeGreaterThanOrEqual(0.012 - 1e-9);
    expect(clickDt(0, 1000, 12)).toBeGreaterThanOrEqual(0.012);
  });
  it('is deterministic for a seed and differs across seeds', () => {
    const a = simulateClicks(cfg, 42, 10, 5);
    expect(simulateClicks(cfg, 42, 10, 5)).toEqual(a);
    expect(simulateClicks(cfg, 43, 10, 5)).not.toEqual(a);
  });
  it('chunked advance equals one long advance', () => {
    const one = simulateClicks(cfg, 9, 8, 4);
    const s = createClickScheduler(cfg, 9);
    const parts = [1, 2, 3, 4].flatMap((u) => s.advance(u, () => 8));
    expect(parts).toEqual(one);
  });
  it('scatter stays inside the palette bounds', () => {
    for (const c of simulateClicks(cfg, 5, 20, 10)) {
      expect(Math.abs(c.gainDb)).toBeLessThanOrEqual(3);
      expect(Math.abs(c.playbackRate - 1)).toBeLessThanOrEqual(0.12);
    }
  });
  it('rate 0 yields no clicks', () => {
    expect(simulateClicks(cfg, 1, 0, 10)).toHaveLength(0);
  });
  it('click variants are 1 to 3 ms, weighted to 1.5', () => {
    expect(variantDurationsMs([1, 3])).toEqual([1, 1.5, 1.5, 3]);
  });
});

describe('ramps and cues', () => {
  it('scan rate eases from QUIET to the tier rate', () => {
    expect(scanRate(cfg, 'critical', 'brave', 0)).toBe(1);
    expect(scanRate(cfg, 'critical', 'brave', 1)).toBe(22);
    expect(scanRate(cfg, 'strong', 'standard', 0.5)).toBeCloseTo((0.8 + 10) / 2, 5);
    expect(glideAt({ from: 2, to: 10, startT: 1, durS: 2 }, 2)).toBe(6);
  });
  it('wobble is bounded and deterministic', () => {
    for (let t = 0; t < 30; t += 0.37) expect(Math.abs(wobble(t, 5))).toBeLessThanOrEqual(1);
    expect(wobble(3.3, 5)).toBe(wobble(3.3, 5));
  });
  it('graticule crossings count 25 mG lines', () => {
    expect(graticuleCrossings(10, 30, 25)).toBe(1);
    expect(graticuleCrossings(10, 80, 25)).toBe(3);
    expect(graticuleCrossings(30, 40, 25)).toBe(0);
  });
  it('breakthrough only on STRONG and CRITICAL, second pass on brave', () => {
    expect(breakthroughAtPhase('active', 'brave', 3)).toBe(false);
    expect(breakthroughAtPhase('strong', 'standard', 3)).toBe(true);
    expect(breakthroughAtPhase('strong', 'standard', 4)).toBe(false);
    expect(breakthroughAtPhase('critical', 'brave', 4)).toBe(true);
  });
  it('scare window matches palette: 5.6 to 6.2 s in an 8 s scan, 0.7 T otherwise', () => {
    const w = scareWindow(cfg, 8000)!;
    expect(w.startMs).toBeCloseTo(5600, 5);
    expect(w.endMs).toBeCloseTo(6150, 5);
    expect(scareWindow(cfg, 6000)).toBeNull();
    for (const ms of [7000, 9000, 10000]) {
      const x = scareWindow(cfg, ms)!;
      expect(x.endMs + cfg.scare.durationMs + 150 + cfg.holdMs).toBeLessThanOrEqual(ms + 1e-6);
      expect(x.startMs).toBeLessThanOrEqual(x.endMs);
    }
  });
  it('scan cues: relay first, hold at active end, reveal at the end; fault shifts the hold', () => {
    const c = scanCues(cfg, 8000, 'critical', 'standard');
    expect(c[0]).toEqual({ tMs: 0, cue: 'relay' });
    expect(c.find((x) => x.cue === 'hold')!.tMs).toBe(6800);
    expect(c.at(-1)).toEqual({ tMs: 8000, cue: 'reveal' });
    expect(c.some((x) => x.cue === 'breakthrough')).toBe(true);
    expect(scanCues(cfg, 8000, 'trace', 'standard').some((x) => x.cue === 'breakthrough')).toBe(false);
    expect(scanCues(cfg, 8000, 'active', 'standard', true).find((x) => x.cue === 'hold')!.tMs).toBe(8300);
  });
});
