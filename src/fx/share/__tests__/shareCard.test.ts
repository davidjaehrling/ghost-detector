import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { FONT_FILES, readBytes, skiaModule } from './skiaNode';

vi.mock('@shopify/react-native-skia', () => skiaModule());
vi.mock('react-native', () => ({ Platform: { OS: 'web' }, PixelRatio: { get: () => 1 } }));

// P6-01: the card rendered by the real renderer on CanvasKit in Node, measured from its pixels.
type Mod = typeof import('../render');
let R: Mod;
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

function card(fixture: string, name: 'quiet' | 'active' | 'strong' | 'critical', format: 'story' | 'square', deep = false) {
  const photo = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(readBytes(`e2e/fixtures/${fixture}.png`)));
  const record = demo.demoRecord(name, 'fixture', demo.DEMO_CASES[name]);
  if (deep) record.deepScanAt = record.createdAt;
  return R.drawShareCard({ record, format, photo, stats: statsFromImage(photo), fonts });
}

// Independent WCAG 2.x relative luminance (not the renderer's helper).
const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const relLum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const pct = (a: number[], q: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(q * a.length))]!;

/** Ink rows (cap height) and contrast of light text in a region, from the rendered pixels. */
function measure(img: any, box: { x0: number; y0: number; x1: number; y1: number }) {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const px: Uint8Array = img.readPixels(box.x0, box.y0, { width: w, height: h, colorType: 4, alphaType: 3 });
  const Y = (x: number, y: number) => { const i = (y * w + x) * 4; return luma(px[i]!, px[i + 1]!, px[i + 2]!); };
  const all: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) all.push(Y(x, y));
  const t = (pct(all, 0.5) + pct(all, 0.99)) / 2;
  const ink = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && Y(x, y) >= t;
  let top = -1, bottom = -1;
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (ink(x, y)) n++;
    if (n >= 2) { if (top < 0) top = y; bottom = y; }
  }
  const text: number[] = [];
  const ground: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const L = relLum(px[i]!, px[i + 1]!, px[i + 2]!);
      if (ink(x, y) && ink(x - 1, y) && ink(x + 1, y) && ink(x, y - 1) && ink(x, y + 1)) text.push(L);
      else {
        let near = false;
        for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3 && !near; dx++) if (ink(x + dx, y + dy)) near = true;
        if (!near) ground.push(L);
      }
    }
  const lt = pct(text, 0.1); // a dim glyph pixel
  const lb = pct(ground, 0.95); // a bright pixel behind
  return { cap: bottom - top + 1, top: box.y0 + top, bottom: box.y0 + bottom, contrast: (lt + 0.05) / (lb + 0.05) };
}

function marks(c: ReturnType<Mod['drawShareCard']>) {
  const [strip, footer] = c.marks;
  const s = measure(c.image, { x0: Math.round(strip!.x) - 4, y0: c.strip.y, x1: Math.min(c.strip.x + c.strip.w, Math.round(strip!.x + strip!.w) + 4), y1: c.strip.y + c.strip.h });
  const pad = Math.round(footer!.h * 0.6);
  const f = measure(c.image, { x0: Math.round(footer!.x) - pad, y0: Math.round(footer!.y) - pad, x1: Math.round(footer!.x + footer!.w) + pad, y1: Math.round(footer!.baseline) + pad });
  return { s, f };
}

const CASES = [
  ['cellar', 'critical', true],
  ['bright', 'strong', false],
  ['outdoors', 'active', false],
  ['black', 'quiet', false],
] as const;

describe('SIMULATED mark, measured from the rendered pixels', () => {
  for (const format of ['story', 'square'] as const)
    for (const [fixture, name, deep] of CASES)
      it(`${format} ${fixture} ${name}${deep ? ' deep' : ''}`, () => {
        const c = card(fixture, name, format, deep);
        expect([c.width, c.height]).toEqual(format === 'story' ? [1080, 1920] : [1080, 1080]);
        const { s, f } = marks(c);
        console.log(`${format} ${fixture} ${name}: strip cap ${s.cap} px contrast ${s.contrast.toFixed(2)} (scrim ${c.strip.alpha}); footer cap ${f.cap} px contrast ${f.contrast.toFixed(2)}; floor ${(0.02 * c.height).toFixed(1)} px`);
        for (const m of [s, f]) {
          expect(m.cap).toBeGreaterThanOrEqual(0.02 * c.height);
          expect(m.contrast).toBeGreaterThanOrEqual(4.5);
        }
        if (format === 'story') {
          // The strip (scrim and ink) sits inside the story safe zone y 250 to 1580.
          expect(s.top).toBeGreaterThanOrEqual(250);
          expect(c.strip.y).toBeGreaterThanOrEqual(250);
          expect(c.strip.y + c.strip.h).toBeLessThanOrEqual(1580);
          expect(s.bottom).toBeLessThanOrEqual(1580);
        }
      }, 60000);
});

describe('card contents', () => {
  it('is byte-identical for a fixed seed', () => {
    const a = R.encodePng(card('cellar', 'active', 'story').image);
    const b = R.encodePng(card('cellar', 'active', 'story').image);
    expect(a.length).toBeGreaterThan(1000);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  }, 60000);

  it('draws only the brief strings: no key, QR, arrow, link or claim word', () => {
    const c = card('cellar', 'critical', 'square', true);
    expect(c.fileName).toBe('field-card-0004-simulated.png');
    expect(c.texts).toEqual([
      'VELDEN  FS-4/87-P',
      expect.stringMatching(/^CASE 0004 · SPI \d+ · ΔT -?\d+\.\d °C · \d\d:\d\d · $/),
      'SIMULATED',
      expect.stringMatching(/^\d+$/),
      'CRITICAL',
      expect.stringMatching(/^CLASS: [A-Z-]+ · ERA EST\. \d{4} TO \d{4}$/),
      expect.stringMatching(/^EVP ".+"$/),
      '[STORE NAME] · READINGS ARE ',
      'SIMULATED',
    ]);
    const plain = card('cellar', 'active', 'story');
    expect(plain.texts[5]).toMatch(/^SIGNATURE \d+% DECODED$/);
    expect(card('black', 'quiet', 'story').texts[5]).toBe('NO SIGNATURE');
    const banned = /\b(detected|proof|verified|confirmed|unconfirmed|accurate|real|deep scan|sponsored|download|install|qr|http|www)\b|[←→↑↓⇦⇨➔▶◀★☆]/i;
    for (const t of [...c.texts, ...plain.texts]) expect(t).not.toMatch(banned);
    // The renderer has no path, line or arc drawing at all (no arrow, circle or box at the figure).
    const src = readFileSync(join(__dirname, '..', 'render.ts'), 'utf8');
    expect(src).not.toMatch(/drawPath|drawLine|drawArc|drawOval|PathBuilder|MakeFromSVGString/);
  }, 60000);

  it('keeps the opacity the user saw (card placement = screen placement opacity)', async () => {
    const { figureLayout } = await import('../figure');
    const photo = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(readBytes('e2e/fixtures/cellar.png')));
    const stats = statsFromImage(photo);
    for (const name of ['active', 'strong', 'critical'] as const) {
      const record = demo.demoRecord(name, 'x', demo.DEMO_CASES[name]);
      const screen = figureLayout({ record, stats, panel: { w: 362, h: 303 }, aspect: 4 / 3 })!;
      for (const panel of [{ w: 500, h: 625 }, { w: 540, h: 380 }]) {
        expect(figureLayout({ record, stats, panel, aspect: 4 / 3 })!.placement.opacity).toBe(screen.placement.opacity);
      }
    }
  });
});
