import { describe, expect, it } from 'vitest';
import {
  BAR_BLOCKS,
  FAULT_MS,
  HOLD_MS,
  PHASE_LINES,
  RATE_CAP,
  barBlocks,
  elapsedForPhase,
  faultFor,
  faultOn,
  frameAt,
  liveAt,
  logBefore,
  rateAt,
  readingAt,
  scanLeds,
} from '../timeline';

const T = 8000;

describe('scan timeline', () => {
  it('runs five phases, then a 1.2 s hold, then done', () => {
    expect(frameAt(0, T).kind).toBe('phase');
    const seen = new Set<number>();
    for (let e = 0; e < T - HOLD_MS; e += 50) {
      const f = frameAt(e, T);
      expect(f.kind).toBe('phase');
      if (f.kind === 'phase') seen.add(f.phase);
    }
    expect([...seen]).toEqual([0, 1, 2, 3, 4]);
    expect(frameAt(T - HOLD_MS, T).kind).toBe('hold');
    expect(frameAt(T - 1, T).kind).toBe('hold');
    expect(frameAt(T, T).kind).toBe('done');
  });

  it('hold is 1.2 s for every duration from 6 to 10 s', () => {
    for (const d of [6000, 7000, 8000, 9000, 10000]) {
      expect(frameAt(d - HOLD_MS - 1, d).kind).toBe('phase');
      expect(frameAt(d - HOLD_MS, d).kind).toBe('hold');
    }
  });

  it('progress reaches 85% at the cut for T = 8 s and freezes in the hold', () => {
    const f = frameAt(T - HOLD_MS - 1, T);
    expect(f.progress).toBeCloseTo(0.85, 2);
    expect(frameAt(T - 500, T).progress).toBe(frameAt(T - HOLD_MS, T).progress);
    expect(frameAt(T - 500, T).tick).toBe(frameAt(T - HOLD_MS, T).tick);
  });

  it('freezes harness phases inside their phase', () => {
    for (const p of [0, 1, 2, 3, 4] as const) {
      const f = frameAt(elapsedForPhase(p, T), T);
      expect(f.kind === 'phase' && f.phase).toBe(p);
    }
    expect(frameAt(elapsedForPhase('hold', T), T).kind).toBe('hold');
  });

  it('ladder climbs from 1 to 4 and never shows 5', () => {
    const leds = Array.from({ length: 160 }, (_, i) => scanLeds(frameAt(i * 50, T)));
    expect(leds[0]).toBe(1);
    expect(Math.max(...leds)).toBe(4);
    for (let i = 1; i < leds.length; i++) expect(leds[i]!).toBeGreaterThanOrEqual(leds[i - 1]!);
  });

  it('bar blocks stay within range', () => {
    expect(barBlocks(0)).toBe(0);
    expect(barBlocks(0.85)).toBe(17);
    expect(barBlocks(1)).toBe(BAR_BLOCKS);
  });

  it('readings are deterministic and telemetry lines are 3 to 6 words', () => {
    expect(readingAt(417, 2, 10)).toBe(readingAt(417, 2, 10));
    expect(readingAt(417, 2, 10)).not.toBe(readingAt(418, 2, 10));
    for (const l of PHASE_LINES) {
      const words = l.split(' ').length;
      expect(words).toBeGreaterThanOrEqual(3);
      expect(words).toBeLessThanOrEqual(6);
    }
    expect(logBefore(4)).toEqual([PHASE_LINES[1], PHASE_LINES[2], PHASE_LINES[3]]);
    expect(logBefore(0)).toEqual([]);
  });
});

describe('scan round 2', () => {
  it('LED 4 goes dark for the hold on STRONG and CRITICAL only', () => {
    const hold = frameAt(T - HOLD_MS / 2, T);
    expect(hold.kind).toBe('hold');
    expect(scanLeds(hold, 'strong')).toBe(3);
    expect(scanLeds(hold, 'critical')).toBe(3);
    expect(scanLeds(hold, 'active')).toBe(4);
    expect(scanLeds(frameAt(T - HOLD_MS - 10, T), 'critical')).toBe(4);
  });

  it('sweep runs twice as fast in the last 1.5 s and freezes in the hold', () => {
    const active = T - HOLD_MS;
    const slow = frameAt(1000, T).sweep - frameAt(900, T).sweep;
    const fast = frameAt(active - 200, T).sweep - frameAt(active - 300, T).sweep;
    expect(fast).toBeCloseTo(slow * 2, 5);
    expect(frameAt(active - 1, T).final).toBe(true);
    expect(frameAt(active - 1501, T).final).toBe(false);
    expect(frameAt(active + 100, T).sweep).toBe(frameAt(active + 900, T).sweep);
  });

  it('the fault beat adds 1.5 s, freezes the scan inside it and resumes after', () => {
    const at = elapsedForPhase('fault', T);
    const f = frameAt(at, T, true);
    expect(f.kind).toBe('fault');
    expect(frameAt(at + 600, T, true).t).toBe(f.t);
    expect(frameAt(at - 100 + FAULT_MS, T, true).kind).toBe('phase');
    expect(frameAt(T + FAULT_MS - 1, T, true).kind).toBe('hold');
    expect(frameAt(T + FAULT_MS, T, true).kind).toBe('done');
    expect(frameAt(T, T, false).kind).toBe('done');
  });

  it('the fault code blinks at 2 Hz for three cycles', () => {
    expect(faultOn(0)).toBe(true);
    expect(faultOn(249)).toBe(true);
    expect(faultOn(250)).toBe(false);
    expect(faultOn(500)).toBe(true);
  });

  it('about 1 scan in 15 has a fault, decided by the seed alone', () => {
    let n = 0;
    for (let seed = 1; seed <= 3000; seed++) if (faultFor(seed)) n++;
    expect(n / 3000).toBeGreaterThan(1 / 15 - 0.02);
    expect(n / 3000).toBeLessThan(1 / 15 + 0.02);
    expect(faultFor(417)).toBe(faultFor(417));
  });

  it('the rate climbs toward the intensity cap and never passes it', () => {
    for (const cap of Object.values(RATE_CAP)) {
      const early = rateAt(417, 3, 0.05, cap);
      const late = rateAt(417, 60, 0.99, cap);
      expect(late).toBeGreaterThan(early);
      for (let tick = 0; tick < 200; tick++) expect(rateAt(417, tick, tick / 200, cap)).toBeLessThanOrEqual(cap);
    }
    expect(RATE_CAP).toEqual({ calm: 6, standard: 14, brave: 22 });
  });

  it('live readings carry label, value and unit', () => {
    expect(liveAt(417, 1, 10)).toMatchObject({ label: 'FLUX', unit: 'mG' });
    expect(liveAt(417, 2, 10)).toMatchObject({ label: 'ΔT', unit: '°C' });
    expect(readingAt(417, 3, 5)).toMatch(/^LVL -\d+ dBFS$/);
  });
});
