import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { FONT_FILES, heapBytes, readBytes, skiaModule, trackHandles } from './skiaNode';

vi.mock('@shopify/react-native-skia', () => skiaModule());
vi.mock('react-native', () => ({ Platform: { OS: 'web' }, PixelRatio: { get: () => 1 } }));

// CanvasKit's wasm heap grows and never shrinks, and nothing it allocates is garbage collected:
// a card render that leaves one Paint, Font, Shader, Image or Surface undeleted grows the heap with
// every card until CanvasKit aborts (the share card file died at about 63 renders). Here 40 cards
// in one file must hold the same live CanvasKit objects and the same heap size once the
// caches are warm (the compiled shaders and the apparition cache, bounded; 2 formats x 4 tiers fill it in 8 cards).
const CARDS = 40;
const WARM = 8;

let R: typeof import('../render');
let Skia: any;
let fonts: any;
let demo: typeof import('../../../ui/result/demo');
let statsFromImage: typeof import('../stats').statsFromImage;

beforeAll(async () => {
  Skia = ((await skiaModule()) as any).Skia;
  R = await import('../render');
  demo = await import('../../../ui/result/demo');
  statsFromImage = (await import('../stats')).statsFromImage;
  const tf = (p: string) => Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(readBytes(p)));
  fonts = { vt323: tf(FONT_FILES.vt323), b612: tf(FONT_FILES.b612), b612Bold: tf(FONT_FILES.b612Bold) };
}, 60000);

afterAll(() => {
  for (const f of Object.values(fonts ?? {})) (f as { dispose(): void }).dispose();
});

describe('share card heap (CanvasKit has no GC)', () => {
  it(`renders ${CARDS} cards with no growth in live CanvasKit objects or heap after the first ${WARM}`, async () => {
    const names = ['quiet', 'active', 'strong', 'critical'] as const;
    const fixtures = ['cellar', 'bright', 'outdoors', 'black'] as const;
    const t = trackHandles();
    const live: number[] = [];
    const heap: number[] = [];
    try {
      for (let n = 0; n < CARDS; n++) {
        // The test helpers' own pattern: decode, region statistics, draw, read, free.
        const photo = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(readBytes(`e2e/fixtures/${fixtures[n % 4]}.png`)));
        const name = names[n % 4]!;
        const record = demo.demoRecord(name, 'fixture', demo.DEMO_CASES[name]);
        const c = R.drawShareCard({ record, format: n % 8 < 4 ? 'story' : 'square', photo, stats: statsFromImage(photo), fonts, locale: n % 3 ? 'en' : 'de' });
        photo.dispose();
        expect(c.image.readPixels(0, 0, { width: 4, height: 4, colorType: 4, alphaType: 3 })).toBeTruthy();
        c.image.dispose();
        live.push(t.total());
        heap.push(await heapBytes());
      }
      console.log(`[heap] live CanvasKit objects per card: ${live.join(' ')}; after card ${WARM}: ${JSON.stringify(t.live())}`);
      console.log(`[heap] HEAPU8 MB after card 1, ${WARM}, ${CARDS}: ${[heap[0]!, heap[WARM - 1]!, heap[CARDS - 1]!].map((b) => (b / 2 ** 20).toFixed(2)).join(', ')}`);
    } finally {
      t.stop();
    }
    // Only the caches remain: the compiled RuntimeEffects and the apparition images, all made in the first cards.
    for (const v of live.slice(WARM)) expect(v).toBe(live[WARM - 1]);
    expect(live[WARM - 1]).toBeLessThanOrEqual(16);
    expect(heap[CARDS - 1]).toBe(heap[WARM - 1]);
  }, 300000);
});
