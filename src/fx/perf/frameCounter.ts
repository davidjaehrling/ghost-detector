import { frameStats, type FrameStats } from './stats';

// The FX frame counter (P8-03). On web it installs `window.__fxFrames`, idle until a harness
// calls `start()`: from then on one requestAnimationFrame loop records every frame interval until
// `stop()`, which returns the stats (p50, p95, max, fps) and the raw deltas. Nothing runs while
// idle, so production pays one object on window. Native has no `document` and installs nothing;
// device numbers come from the Skia/Perf monitor at the phone check.

export interface FxFrameCounter {
  start(): void;
  stop(): FrameStats & { deltas: number[] };
  readonly running: boolean;
}

type Win = { __fxFrames?: FxFrameCounter; requestAnimationFrame(cb: (t: number) => void): number; cancelAnimationFrame(id: number): void };

export function makeFrameCounter(raf: Win['requestAnimationFrame'], caf: Win['cancelAnimationFrame']): FxFrameCounter {
  let deltas: number[] = [];
  let last = -1;
  let id = 0;
  let running = false;
  const tick = (t: number) => {
    if (last >= 0) deltas.push(t - last);
    last = t;
    id = raf(tick);
  };
  return {
    start() {
      if (running) caf(id);
      deltas = [];
      last = -1;
      running = true;
      id = raf(tick);
    },
    stop() {
      if (running) caf(id);
      running = false;
      const out = deltas;
      deltas = [];
      return { ...frameStats(out), deltas: out.map((d) => Math.round(d * 100) / 100) };
    },
    get running() {
      return running;
    },
  };
}

export function installFrameCounter(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const w = window as unknown as Win;
  w.__fxFrames ??= makeFrameCounter(w.requestAnimationFrame.bind(window), w.cancelAnimationFrame.bind(window));
}

installFrameCounter();
