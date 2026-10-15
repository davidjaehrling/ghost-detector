import { useEffect, useRef, useState } from 'react';
import { mulberry32 } from '../boot/seed';
import { liveThermalStep } from './flux';

export const THERMAL_HZ = 2;

// The live ΔT beside the flux: it follows the flux (sampled twice a second, not at the 10 Hz of the
// needle) and wobbles by one tenth of a degree, so the last digit is never still on a live screen.
// `?static=1`, reduced motion and a blurred screen hold it.
export function useLiveThermal({ mg, seed, isStatic, active, calm = false }: { mg: number; seed: number; isStatic: boolean; active: boolean; calm?: boolean }): number {
  const hold = isStatic || calm;
  const latest = useRef(mg);
  useEffect(() => {
    latest.current = mg;
  }, [mg]);
  const [state, setState] = useState({ mg, tick: 0 });
  useEffect(() => {
    if (hold || !active) return;
    const id = setInterval(() => setState((s) => ({ mg: latest.current, tick: s.tick + 1 })), 1000 / THERMAL_HZ);
    return () => clearInterval(id);
  }, [hold, active]);
  const shownMg = hold ? mg : state.mg;
  const wobble = hold ? 0 : Math.floor(mulberry32((seed ^ Math.imul(state.tick + 1, 2654435761)) >>> 0)() * 3) - 1;
  return liveThermalStep(shownMg, wobble);
}
