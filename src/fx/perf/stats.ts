// Frame-time statistics for the FX frame counter (P8-03). Pure, so vitest covers it.

export interface FrameStats {
  /** Frame intervals recorded (rAF deltas). */
  frames: number;
  /** Wall time covered, ms. */
  spanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  meanMs: number;
  /** 1000 / p50. */
  fpsP50: number;
  /** Frames per second over the span (frames / span). */
  fpsMean: number;
  /** Intervals over 33.4 ms (two or more vsyncs missed). */
  over33: number;
}

/** Nearest-rank percentile of an ascending list (q in 0..1). */
export function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i]!;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function frameStats(deltas: readonly number[]): FrameStats {
  const sorted = [...deltas].sort((a, b) => a - b);
  const span = deltas.reduce((a, b) => a + b, 0);
  const p50 = percentile(sorted, 0.5);
  return {
    frames: deltas.length,
    spanMs: r2(span),
    p50Ms: r2(p50),
    p95Ms: r2(percentile(sorted, 0.95)),
    maxMs: r2(sorted[sorted.length - 1] ?? 0),
    meanMs: r2(deltas.length ? span / deltas.length : 0),
    fpsP50: r2(p50 > 0 ? 1000 / p50 : 0),
    fpsMean: r2(span > 0 ? (deltas.length * 1000) / span : 0),
    over33: deltas.filter((d) => d > 33.4).length,
  };
}
