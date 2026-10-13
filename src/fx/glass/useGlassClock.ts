import { useEffect, useState } from 'react';
import { readHarness } from '../../ui/harness';

// `static` defaults to the harness flag (?static=1 on web, always false on native).
export function useStaticDefault(prop: boolean | undefined): boolean {
  return prop ?? readHarness().isStatic;
}

// A frame counter that ticks at `hz` while `running`. Stays at 0 when not running, so a
// static render never sees a time-dependent value.
export function useTicker(hz: number, running: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running || hz <= 0) return;
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), 1000 / hz);
    return () => clearInterval(id);
  }, [hz, running]);
  return running ? tick : 0;
}

// Milliseconds of animation since `start` changed, advanced on every animation frame until
// `durationMs`. Each frame adds at most MAX_STEP_MS, so a stall (CanvasKit start-up, shader
// compile, a busy JS thread) slows the animation instead of skipping it. Returns `durationMs`
// at once when not running (the finished state).
const MAX_STEP_MS = 50;

export function useElapsed(durationMs: number, running: boolean, start: unknown = 0): number {
  const [st, setSt] = useState<{ key: unknown; t: number }>({ key: start, t: 0 });
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let t = 0;
    let last = -1;
    const step = (now: number) => {
      if (last >= 0) t = Math.min(durationMs, t + Math.min(MAX_STEP_MS, now - last));
      last = now;
      setSt({ key: start, t });
      if (t < durationMs) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, running, start]);
  if (!running) return durationMs;
  return st.key === start ? st.t : 0;
}
