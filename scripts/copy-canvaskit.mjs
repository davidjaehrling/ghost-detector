// Copy CanvasKit's wasm (the Skia web backend) into public/ so `expo export` and the dev server
// serve it at /canvaskit.wasm. Resolved through @shopify/react-native-skia so the wasm always
// matches the canvaskit-wasm version Skia pins. public/canvaskit.wasm is gitignored.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const skiaPkg = require.resolve('@shopify/react-native-skia/package.json');
const wasm = createRequire(skiaPkg).resolve('canvaskit-wasm/bin/full/canvaskit.wasm');
const out = join(dirname(new URL(import.meta.url).pathname), '..', 'public', 'canvaskit.wasm');
mkdirSync(dirname(out), { recursive: true });
copyFileSync(wasm, out);
console.log(`canvaskit.wasm -> ${out}`);
