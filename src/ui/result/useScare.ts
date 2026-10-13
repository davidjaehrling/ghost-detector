import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (mode !== 'armed' || !go) return;
    // The burst's sound and tap start with the first frame.
    sound.scare();
    const t0 = performance.now();
    let raf = 0;
    let index = 0;
    let painted = 0;
    const tick = () => {
      const next = nextSegment(index, performance.now() - t0, painted);
      if (next !== index) {
        index = next;
        painted = 0;
      }
      const f = SEGMENTS[index]!.frame;
      setFrame((prev) => (prev.flash === f.flash && prev.pop === f.pop && prev.done === f.done ? prev : f));
      painted++;
      if (!f.done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, go]);

  if (mode === 'peak') return view(PEAK_FRAME);
  if (mode === 'off') return OFF;
  return view(frame);
}
