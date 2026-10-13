import { describe, expect, it } from 'vitest';
import { BAR_BLOCKS, HOLD_MS, PHASE_LINES, barBlocks, elapsedForPhase, frameAt, logBefore, readingAt, scanLeds } from '../timeline';

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
