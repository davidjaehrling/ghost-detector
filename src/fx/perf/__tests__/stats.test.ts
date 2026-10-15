import { describe, expect, it } from 'vitest';

import { makeFrameCounter } from '../frameCounter';
import { frameStats, percentile } from '../stats';

describe('frameStats', () => {
  it('takes nearest-rank percentiles', () => {
    const s = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(s, 0.5)).toBe(50);
    expect(percentile(s, 0.95)).toBe(95);
    expect(percentile([], 0.5)).toBe(0);
  });

  it('reports 60 fps for steady 16.67 ms frames and counts long ones', () => {
    const d = [...Array(95).fill(16.67), ...Array(5).fill(50)];
    const st = frameStats(d);
    expect(st.frames).toBe(100);
    expect(st.p50Ms).toBe(16.67);
    expect(st.fpsP50).toBeCloseTo(59.99, 1);
    expect(st.p95Ms).toBe(16.67);
    expect(st.maxMs).toBe(50);
    expect(st.over33).toBe(5);
  });
});

describe('makeFrameCounter', () => {
  it('records intervals between start and stop only', () => {
    const queue: ((t: number) => void)[] = [];
    const raf = (cb: (t: number) => void) => queue.push(cb);
    const c = makeFrameCounter(raf, () => {});
    c.start();
    expect(c.running).toBe(true);
    for (const t of [0, 16, 33, 50]) queue.shift()!(t);
    const st = c.stop();
    expect(st.deltas).toEqual([16, 17, 17]);
    expect(c.running).toBe(false);
  });
});
