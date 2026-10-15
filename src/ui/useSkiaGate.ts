import { useEffect, useState } from 'react';
import { loadSkia, SKIA_NEEDS_LOAD } from '../fx/loadSkia';
import { fault } from '../state/faults';

export type SkiaGate = 'loading' | 'ready' | 'failed';

// The root layout's view of Skia: native is ready at once; web waits for CanvasKit and reports a
// failed load as a state (the layout shows the OPTICS OFFLINE fault) instead of a console error.
export function useSkiaGate(): SkiaGate {
  const [gate, setGate] = useState<SkiaGate>(SKIA_NEEDS_LOAD ? 'loading' : 'ready');
  useEffect(() => {
    if (!SKIA_NEEDS_LOAD) return;
    let live = true;
    const load = fault('skia') ? Promise.reject(new Error('skia fault')) : loadSkia();
    load.then(
      () => live && setGate('ready'),
      () => live && setGate('failed'),
    );
    return () => {
      live = false;
    };
  }, []);
  return gate;
}
