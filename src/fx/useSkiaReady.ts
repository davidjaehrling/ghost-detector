import { useEffect, useState } from 'react';
import { loadSkia, SKIA_NEEDS_LOAD } from './loadSkia';

// True once Skia can draw. Native: at once. Web: after CanvasKit resolves (client only; the
// static render at export time stays false, so nothing Skia-backed is rendered on the server).
export function useSkiaReady(): boolean {
  const [ready, setReady] = useState(!SKIA_NEEDS_LOAD);
  useEffect(() => {
    if (ready) return;
    let live = true;
    loadSkia().then(
      () => live && setReady(true),
      (err: unknown) => console.error('CanvasKit failed to load', err),
    );
    return () => {
      live = false;
    };
  }, [ready]);
  return ready;
}
