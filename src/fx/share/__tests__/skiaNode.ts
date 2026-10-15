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

/**
 * Live CanvasKit objects (embind handles not yet `delete()`d), counted per class. Every handle
 * embind hands to JS is made by `Object.create(classPrototype, { $$ })`, so wrapping Object.create
 * sees each one; a handle is live until its `isDeleted()` turns true. Canvas handles borrowed from a
 * surface (`getCanvas`) are owned by the surface and left out. Test-only instrumentation.
 */
export function trackHandles(): { live(): Record<string, number>; total(): number; stop(): void } {
  const seen = new Set<{ isDeleted(): boolean; constructor: { name: string } }>();
  const create = Object.create;
  Object.create = function (proto: object | null, props?: PropertyDescriptorMap) {
    const o = props ? create(proto, props) : create(proto);
    if (props && proto && typeof (o as { isDeleted?: unknown }).isDeleted === 'function' && typeof (o as { delete?: unknown }).delete === 'function') seen.add(o);
    return o;
  } as typeof Object.create;
  const live = () => {
    const out: Record<string, number> = {};
    for (const h of seen) {
      if (h.isDeleted()) {
        seen.delete(h);
        continue;
      }
      const name = h.constructor?.name ?? '?';
      if (name !== 'Canvas') out[name] = (out[name] ?? 0) + 1;
    }
    return out;
  };
  return {
    live,
    total: () => Object.values(live()).reduce((a, b) => a + b, 0),
    stop: () => {
      Object.create = create;
    },
  };
}

/** Bytes of CanvasKit's wasm heap (it grows and never shrinks). */
export async function heapBytes(): Promise<number> {
  await skiaModule();
  return (globalThis as unknown as { CanvasKit: { HEAPU8: Uint8Array } }).CanvasKit.HEAPU8.length;
}
