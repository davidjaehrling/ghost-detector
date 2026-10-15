import { useSyncExternalStore } from 'react';
import { type ScanFrame, frameAt } from './timeline';

// The 20 Hz scan clock as a tiny store. The route reads only the coarse values it acts on (LED
// count, phase, fault, hold, done) through `useClockSelect`, so it and the housing around the glass
// re-render a handful of times per scan; only the theatre reads the frame itself, every tick.
export type ScanClock = {
  set(elapsedMs: number): void;
  elapsed(): number;
  /** The frame for the current time, computed once per tick however many readers ask. */
  frame(): ScanFrame;
  subscribe(fn: () => void): () => void;
};

export function createScanClock(initialMs: number, durationMs: number, fault: boolean): ScanClock {
  let now = initialMs;
  let cached: { at: number; frame: ScanFrame } | null = null;
  const subs = new Set<() => void>();
  return {
    set(ms) {
      if (ms === now) return;
      now = ms;
      for (const fn of subs) fn();
    },
    elapsed: () => now,
    frame() {
      if (!cached || cached.at !== now) cached = { at: now, frame: frameAt(now, durationMs, fault) };
      return cached.frame;
    },
    subscribe(fn) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
  };
}

/** Re-renders the caller only when `select(frame)` changes; `select` must return a primitive. */
export function useClockSelect<T extends string | number | boolean>(clock: ScanClock, select: (frame: ScanFrame) => T): T {
  const get = () => select(clock.frame());
  return useSyncExternalStore(clock.subscribe, get, get);
}

/** The frame itself, at every tick. For the readouts only. */
export function useClockFrame(clock: ScanClock): ScanFrame {
  useSyncExternalStore(clock.subscribe, clock.elapsed, clock.elapsed);
  return clock.frame();
}
