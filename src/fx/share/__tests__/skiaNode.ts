// Test helper: CanvasKit (the web Skia backend RN Skia wraps) loaded in Node, exposed through RN
// Skia's own JsiSkApi so src/fx code runs unchanged. Used with vi.mock in the share card tests.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const req = createRequire(import.meta.url);
const skiaRoot = join(req.resolve('@shopify/react-native-skia/package.json'), '..');
const skiaReq = createRequire(join(skiaRoot, 'package.json'));

let pending: Promise<Record<string, unknown>> | null = null;

/** The module object to stand in for '@shopify/react-native-skia' (types, enums and Skia). */
export function skiaModule(): Promise<Record<string, unknown>> {
  pending ??= (async () => {
    const init = skiaReq('canvaskit-wasm/bin/full/canvaskit.js') as (o: object) => Promise<unknown>;
    const CanvasKit = await init({ locateFile: (f: string) => skiaReq.resolve(`canvaskit-wasm/bin/full/${f}`) });
    (globalThis as { CanvasKit?: unknown }).CanvasKit = CanvasKit;
    const types = skiaReq('./lib/commonjs/skia/types') as Record<string, unknown>;
    const { JsiSkApi } = skiaReq('./lib/commonjs/skia/web') as { JsiSkApi: (ck: unknown) => unknown };
    return { ...types, Skia: JsiSkApi(CanvasKit) };
  })();
  return pending;
}

const ROOT = join(__dirname, '..', '..', '..', '..');

export function readBytes(rel: string): Uint8Array {
  return new Uint8Array(readFileSync(join(ROOT, rel)));
}

export const FONT_FILES = {
  vt323: 'node_modules/@expo-google-fonts/vt323/400Regular/VT323_400Regular.ttf',
  b612: 'node_modules/@expo-google-fonts/b612-mono/400Regular/B612Mono_400Regular.ttf',
  b612Bold: 'node_modules/@expo-google-fonts/b612-mono/700Bold/B612Mono_700Bold.ttf',
} as const;
