import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { GlassProps } from '../Glass';
import type { GlassWarpProps } from '../GlassWarp';
import type { PhosphorTextProps } from '../Phosphor';
import { afterFrames, createReadySignal } from '../ready';

// A manual frame queue standing in for requestAnimationFrame.
function frames() {
  let next = 1;
  const q = new Map<number, () => void>();
  return {
    raf: (cb: () => void) => {
      q.set(next, cb);
      return next++;
    },
    caf: (id: number) => void q.delete(id),
    tick() {
      const run = [...q.values()];
      q.clear();
      run.forEach((cb) => cb());
    },
    get pending() {
      return q.size;
    },
  };
}

describe('glass signal props (types)', () => {
  it('PhosphorText takes onReady, GlassWarp and Glass take onSnapshot(key)', () => {
    expectTypeOf<PhosphorTextProps['onReady']>().toEqualTypeOf<(() => void) | undefined>();
    expectTypeOf<GlassWarpProps['onSnapshot']>().toEqualTypeOf<((key: string) => void) | undefined>();
    expectTypeOf<GlassProps['onSnapshot']>().toEqualTypeOf<((key: string) => void) | undefined>();
  });
});

describe('afterFrames', () => {
  it('fires after exactly n frames and can be cancelled', () => {
    const f = frames();
    const cb = vi.fn();
    afterFrames(2, cb, f.raf, f.caf);
    f.tick();
    expect(cb).not.toHaveBeenCalled();
    f.tick();
    expect(cb).toHaveBeenCalledTimes(1);
    const cb2 = vi.fn();
    const cancel = afterFrames(2, cb2, f.raf, f.caf);
    f.tick();
    cancel();
    f.tick();
    f.tick();
    expect(cb2).not.toHaveBeenCalled();
    expect(f.pending).toBe(0);
  });
});

describe('createReadySignal (PhosphorText onReady)', () => {
  it('waits for the font, then one frame, and fires once per mount', () => {
    const f = frames();
    const s = createReadySignal();
    const cb = vi.fn();
    expect(s.arm(false, cb, f.raf, f.caf)).toBeUndefined(); // font still loading
    s.arm(true, cb, f.raf, f.caf);
    expect(cb).not.toHaveBeenCalled(); // not in the same frame as the font landing
    f.tick();
    expect(cb).toHaveBeenCalledTimes(1);
    // Re-renders, a text change or a new font size re-run the effect: no second call.
    expect(s.arm(true, cb, f.raf, f.caf)).toBeUndefined();
    f.tick();
    expect(cb).toHaveBeenCalledTimes(1);
  });
  it('still fires exactly once when the effect is cleaned up before the frame', () => {
    const f = frames();
    const s = createReadySignal();
    const cb = vi.fn();
    const cancel = s.arm(true, cb, f.raf, f.caf)!;
    cancel();
    f.tick();
    expect(cb).not.toHaveBeenCalled();
    expect(s.fired).toBe(false);
    s.arm(true, cb, f.raf, f.caf);
    f.tick();
    f.tick();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
