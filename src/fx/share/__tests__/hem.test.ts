import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FONT_FILES, readBytes, skiaModule } from './skiaNode';

vi.mock('@shopify/react-native-skia', () => skiaModule());
vi.mock('react-native', () => ({ Platform: { OS: 'web' }, PixelRatio: { get: () => 1 } }));

// A-98, in its own file: CanvasKit's wasm heap is per test file, and shareCard.test.ts is near its limit.
type Mod = typeof import('../render');
let R: Mod;
let Skia: any;
let fonts: any;
let demo: typeof import('../../../ui/result/demo');
let statsFromImage: typeof import('../stats').statsFromImage;

beforeAll(async () => {
  const mod = (await skiaModule()) as any;
  Skia = mod.Skia;
  R = await import('../render');
  demo = await import('../../../ui/result/demo');
  statsFromImage = (await import('../stats')).statsFromImage;
  const tf = (p: string) => Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(readBytes(p)));
  fonts = { vt323: tf(FONT_FILES.vt323), b612: tf(FONT_FILES.b612), b612Bold: tf(FONT_FILES.b612Bold) };
}, 60000);

const made: { dispose(): void }[] = [];
afterEach(() => {
  for (const img of made.splice(0)) img.dispose();
});

function card(fixture: string, name: 'critical', format: 'story' | 'square', deep: boolean, _locale?: undefined, opts: { fx?: { ghost?: boolean } } = {}) {
  const photo = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(readBytes(`e2e/fixtures/${fixture}.png`)));
  const record = demo.demoRecord(name, 'fixture', demo.DEMO_CASES[name]);
  if (deep) record.deepScanAt = record.createdAt;
  const c = R.drawShareCard({ record, format, photo, stats: statsFromImage(photo), fonts, ...opts });
  photo.dispose();
  made.push(c.image);
  return c;
}

function pixels(img: any, b: { x: number; y: number; w: number; h: number }): Uint8Array {
  return img.readPixels(b.x, b.y, { width: b.w, height: b.h, colorType: 4, alphaType: 3 });
}

function figureBox(c: ReturnType<Mod['drawShareCard']>) {
  const p = c.figure!.placement;
  const P = c.layout.photo;
  const x0 = Math.max(P.x, Math.round(P.x + p.x * 2));
  const y0 = Math.max(P.y, Math.round(P.y + p.y * 2));
  const x1 = Math.min(P.x + P.w, Math.round(P.x + (p.x + p.w) * 2));
  const y1 = Math.min(P.y + P.h, Math.round(P.y + (p.y + p.h) * 2));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * A-98: the figure's hem must dissolve into the foreground mass, never end on a ragged line that
 * reads as a dark fringe under it. Measured on the ghost's own light (the card with the figure minus
 * the same card without it, both 5 x 5 box-blurred so the grain cancels), in every column of the
 * figure box under the mass, from HEM_ABOVE px above the mass's local top edge to HEM_BELOW under it:
 * the light may fall by at most HEM_DROP_MAX luma over 8 px, and no pixel is darker than without the
 * figure. Before the fix (the ghost cut by the mass's 12 px ramp before the clamp) the cellar cards
 * fell 17.7 (story) and 15.1 (square) luma in 8 px at the hem (the same test at f6566b4); after it 8.3 and 7.4.
 */
const HEM_DROP_MAX = 10;
const HEM_ABOVE = 40;
const HEM_BELOW = 30;
describe('hem edge under the figure (A-98)', () => {
  const blurLuma = (px: Uint8Array, w: number, h: number) => {
    const Y = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) Y[i] = luma(px[i * 4]!, px[i * 4 + 1]!, px[i * 4 + 2]!);
    const out = new Float64Array(w * h);
    for (let y = 2; y < h - 2; y++)
      for (let x = 2; x < w - 2; x++) {
        let t = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) t += Y[(y + dy) * w + x + dx]!;
        out[y * w + x] = t / 25;
      }
    return out;
  };
  for (const format of ['story', 'square'] as const)
    it(`${format} cellar critical: the hem light falls at most ${HEM_DROP_MAX} luma in 8 px and never under the photo`, async () => {
      const { bandTopAt } = await import('../../compositor/blend');
      const on = card('cellar', 'critical', format, true);
      const off = card('cellar', 'critical', format, true, undefined, { fx: { ghost: false } });
      expect(on.band, 'the cellar is a flat interior: it takes the mass').not.toBeNull();
      const P = on.layout.photo;
      const fb = figureBox(on);
      const band = on.band!;
      const box = { x: fb.x, y: P.y, w: fb.w, h: P.h };
      const g = blurLuma(pixels(on.image, box), box.w, box.h);
      const n = blurLuma(pixels(off.image, box), box.w, box.h);
      const d = (x: number, y: number) => g[y * box.w + x]! - n[y * box.w + x]!;
      let drop = 0;
      let darkest = 0;
      let at = '';
      for (let x = 2; x < box.w - 2; x++) {
        const top = Math.round(bandTopAt(box.x + x - P.x, band));
        for (let y = Math.max(2, top - HEM_ABOVE); y < Math.min(box.h - 10, top + HEM_BELOW); y++) {
          darkest = Math.min(darkest, d(x, y));
          const v = d(x, y) - d(x, y + 8);
          if (v > drop) {
            drop = v;
            at = `${box.x + x},${box.y + y}`;
          }
        }
      }
      console.log(`[hem] ${format}: mass top ${(P.y + band.top).toFixed(1)} at its centre; largest 8 px drop ${drop.toFixed(2)} luma at ${at}; darkest ${darkest.toFixed(2)}`);
      expect(drop).toBeLessThanOrEqual(HEM_DROP_MAX);
      expect(darkest).toBeGreaterThanOrEqual(-1);
    }, 120000);
});
