import { useEffect, useRef, useState } from 'react';
import { mulberry32 } from '../boot/seed';
import { liveThermalStep } from './flux';

export const THERMAL_HZ = 2;

// The live ΔT beside the flux: it follows the flux (sampled twice a second, not at the 10 Hz of the
// needle) and wobbles by one tenth of a degree, so the last digit is never still on a live screen.
// `?static=1` and a blurred screen hold it.
export function useLiveThermal({ mg, seed, isStatic, active }: { mg: number; seed: number; isStatic: boolean; active: boolean }): number {
  const latest = useRef(mg);
  useEffect(() => {
    latest.current = mg;
  }, [mg]);
  const [state, setState] = useState({ mg, tick: 0 });
  useEffect(() => {
    if (isStatic || !active) return;
    const id = setInterval(() => setState((s) => ({ mg: latest.current, tick: s.tick + 1 })), 1000 / THERMAL_HZ);
    return () => clearInterval(id);
  }, [isStatic, active]);
  const shownMg = isStatic ? mg : state.mg;
  const wobble = isStatic ? 0 : Math.floor(mulberry32((seed ^ Math.imul(state.tick + 1, 2654435761)) >>> 0)() * 3) - 1;
  return liveThermalStep(shownMg, wobble);
}
