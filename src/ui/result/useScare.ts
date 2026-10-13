import { useEffect, useRef, useState } from 'react';
import { sound } from '../audio';
import { PEAK_FRAME, REST, SEGMENTS, type ScareFrame, nextSegment } from './scare';

// 'off': nothing. 'armed': plays once when `go` turns true (the number lands). 'peak': the
// frozen pop frame (?static=1&scare=1 golden).
export type ScareMode = 'off' | 'armed' | 'peak';

// What the glass shows now. `pop` is null while no scare is possible, 0 while armed (the figure
// layer is mounted at zero opacity so its image is ready) and 1 on the pop frame.
export type ScareView = { flash: number; pop: number | null };

const OFF: ScareView = { flash: 0, pop: null };
const view = (f: ScareFrame): ScareView => (f.done ? OFF : { flash: f.flash, pop: f.pop ? 1 : 0 });

export function useScare(mode: ScareMode, go: boolean): ScareView {
  const [frame, setFrame] = useState<ScareFrame>(REST);
  // Renders committed for the picture now on screen. The clock moves on only after one, so a busy
  // thread that batches two state changes cannot swallow a flash.
  const committed = useRef(0);
  useEffect(() => {
    committed.current++;
  });

  useEffect(() => {
    if (mode !== 'armed' || !go) return;
    // The burst's sound and tap start with the first frame.
    sound.scare();
    // The clock starts with the first frame, so a late first frame cannot eat into the pop.
    let t0 = -1;
    let raf = 0;
    let index = -1;
    let shown: ScareFrame = REST;
    const tick = () => {
      const now = performance.now();
      if (t0 < 0) t0 = now;
      const next = index < 0 ? 0 : nextSegment(index, now - t0, committed.current);
      if (next !== index) {
        index = next;
        committed.current = 0;
        const f = SEGMENTS[index]!.frame;
        const same = f.flash === shown.flash && f.pop === shown.pop && f.done === shown.done;
        shown = f;
        if (same) committed.current = 1;
        else setFrame(f);
      }
      if (!shown.done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, go]);

  if (mode === 'peak') return view(PEAK_FRAME);
  if (mode === 'off') return OFF;
  return view(frame);
}
