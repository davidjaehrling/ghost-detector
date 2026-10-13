// Web: Skia runs on CanvasKit (wasm). `scripts/copy-canvaskit.mjs` puts canvaskit.wasm in
// public/, which Expo serves at the site root in dev and copies into the static export.
// The loader module is imported lazily so the CanvasKit glue stays out of the entry bundle.
let pending: Promise<void> | null = null;

export function loadSkia(): Promise<void> {
  pending ??= import('@shopify/react-native-skia/lib/module/web').then(({ LoadSkiaWeb }) =>
    LoadSkiaWeb({ locateFile: (file: string) => `/${file}` }),
  );
  return pending;
}

export const SKIA_NEEDS_LOAD = true;
