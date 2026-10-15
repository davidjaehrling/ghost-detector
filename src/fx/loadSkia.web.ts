// Web: Skia runs on CanvasKit (wasm). `scripts/copy-canvaskit.mjs` puts canvaskit.wasm in
// public/, which Expo serves at the site root in dev and copies into the static export. Under
// experiments.baseUrl (GitHub Pages) Expo inlines EXPO_BASE_URL; it is empty at the root.
// The loader module is imported lazily so the CanvasKit glue stays out of the entry bundle.
//
// react-native-skia builds its `Skia` singleton once, as `JsiSkApi(global.CanvasKit)`, when
// lib/module/skia/Skia.web.js is first evaluated. In the dev bundle expo-router's
// validateRouteTreeExports (NODE_ENV=development only) evaluates every route module while it
// builds the route tree, before the root layout's Skia gate can run, so the singleton is built
// over an undefined CanvasKit and every factory call throws (E-52/E-60 on the dev server). Once
// CanvasKit is loaded we repair the singleton in place (see repairSkia). In the static export the
// singleton is built after the load and the repair changes nothing.
let pending: Promise<void> | null = null;

export function loadSkia(): Promise<void> {
  pending ??= import("@shopify/react-native-skia/lib/module/web")
    .then(({ LoadSkiaWeb }) =>
      LoadSkiaWeb({
        locateFile: (file: string) =>
          `${process.env.EXPO_BASE_URL ?? ""}/${file}`,
      }),
    )
    .then(() =>
      Promise.all([
        import("@shopify/react-native-skia"),
        import("@shopify/react-native-skia/lib/module/skia/web"),
      ]),
    )
    .then(([{ Skia }, { JsiSkApi }]) =>
      repairSkia(
        Skia as unknown as Api,
        JsiSkApi(globalThis.CanvasKit) as unknown as Api,
      ),
    );
  return pending;
}

type Api = Record<string, unknown>;

// Factory objects (Skia.Typeface, Skia.Image, ...) keep their identity, because react-native-skia's
// own modules bind to them at load (`Skia.Image.MakeImageFromEncoded.bind(Skia.Image)`); only their
// fields (the CanvasKit handle) are refreshed. Closure members (Skia.Paint, Skia.Point) are replaced.
export function repairSkia(skia: Api, fresh: Api): void {
  for (const [key, next] of Object.entries(fresh)) {
    const prev = skia[key];
    if (
      prev &&
      next &&
      typeof prev === "object" &&
      typeof next === "object" &&
      prev.constructor === next.constructor
    ) {
      Object.assign(prev, next);
    } else {
      skia[key] = next;
    }
  }
}

export const SKIA_NEEDS_LOAD = true;
