// Frame-delayed, fire-once signals for the glass (PhosphorText onReady, GlassWarp onSnapshot).
// Pure so the timing is unit-tested without a renderer.

type Raf = (cb: () => void) => number;
type Caf = (id: number) => void;

// Calls `cb` after `frames` animation frames. Returns a cancel.
export function afterFrames(frames: number, cb: () => void, raf: Raf = requestAnimationFrame, caf: Caf = cancelAnimationFrame): () => void {
  let id = 0;
  let cancelled = false;
  const step = (left: number) => {
    if (cancelled) return;
    if (left <= 0) return cb();
    id = raf(() => step(left - 1));
  };
  step(frames);
  return () => {
    cancelled = true;
    caf(id);
  };
}

// One per mount. `arm(ready, cb)` schedules `cb` one frame after `ready` holds; once it has
// fired, later arms do nothing. The returned cancel (effect cleanup) drops a pending fire, so a
// re-armed signal still fires exactly once.
export function createReadySignal() {
  let fired = false;
  return {
    get fired() {
      return fired;
    },
    arm(ready: boolean, cb: () => void, raf?: Raf, caf?: Caf): (() => void) | undefined {
      if (!ready || fired) return undefined;
      return afterFrames(
        1,
        () => {
          fired = true;
          cb();
        },
        raf,
        caf,
      );
    },
  };
}
