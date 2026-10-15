import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FONT_FILES, readBytes, skiaModule } from './skiaNode';

vi.mock('@shopify/react-native-skia', () => skiaModule());
vi.mock('react-native', () => ({ Platform: { OS: 'web' }, PixelRatio: { get: () => 1 } }));

// P6-01: the card rendered by the real renderer on CanvasKit in Node, measured from its pixels.
// P7-06: per locale, over the locale files present (locales/<lang>.json); `en` must be there.
type Lang = 'en' | 'de' | 'es' | 'pt';
const LOCALES = (['en', 'de', 'es', 'pt'] as const).filter((l) => existsSync(join(__dirname, '..', '..', '..', '..', 'locales', `${l}.json`)));
/** The mark and footer sentence per D-038 (docs/localisation-rules.md section 1). */
const MARK_TABLE: Record<Lang, { mark: string; footer: string }> = {
  en: { mark: 'SIMULATED', footer: 'READINGS ARE SIMULATED' },
  de: { mark: 'SIMULIERT', footer: 'WERTE SIND SIMULIERT' },
  es: { mark: 'SIMULADO', footer: 'LECTURAS SIMULADAS' },
  pt: { mark: 'SIMULADO', footer: 'LEITURAS SIMULADAS' },
};
type Mod = typeof import('../render');
let R: Mod;
let Skia: any;
let fonts: any;
let demo: typeof import('../../../ui/result/demo');
let statsFromImage: typeof import('../stats').statsFromImage;
let R_IMAGE_FORMAT: any;

beforeAll(async () => {
  const mod = (await skiaModule()) as any;
  Skia = mod.Skia;
  R_IMAGE_FORMAT = mod.ImageFormat;
  R = await import('../render');
  demo = await import('../../../ui/result/demo');
  statsFromImage = (await import('../stats')).statsFromImage;
  const tf = (p: string) => Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(readBytes(p)));
  fonts = { vt323: tf(FONT_FILES.vt323), b612: tf(FONT_FILES.b612), b612Bold: tf(FONT_FILES.b612Bold) };
}, 60000);

function card(fixture: string, name: 'quiet' | 'active' | 'strong' | 'critical', format: 'story' | 'square', deep = false, locale?: Lang, opts: { store?: string; fx?: { tint?: boolean; ghost?: boolean } } = {}) {
  const photo = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(readBytes(`e2e/fixtures/${fixture}.png`)));
  const record = demo.demoRecord(name, 'fixture', demo.DEMO_CASES[name]);
  if (deep) record.deepScanAt = record.createdAt;
  const c = R.drawShareCard({ record, format, photo, stats: statsFromImage(photo), fonts, locale, ...opts });
  photo.dispose();
  made.push(c.image);
  return c;
}

// CanvasKit's wasm heap has no GC: every card image is freed after its test.
const made: { dispose(): void }[] = [];
afterEach(() => {
  for (const img of made.splice(0)) img.dispose();
});

/** RGBA pixels of a box of a card image. */
function pixels(img: any, b: { x: number; y: number; w: number; h: number }): Uint8Array {
  return img.readPixels(b.x, b.y, { width: b.w, height: b.h, colorType: 4, alphaType: 3 });
}

/** The figure's box on the card (the placement box, card pixels), clipped to the photo window. */
function figureBox(c: ReturnType<Mod['drawShareCard']>) {
  const p = c.figure!.placement;
  const P = c.layout.photo;
  const x0 = Math.max(P.x, Math.round(P.x + p.x * 2));
  const y0 = Math.max(P.y, Math.round(P.y + p.y * 2));
  const x1 = Math.min(P.x + P.w, Math.round(P.x + (p.x + p.w) * 2));
  const y1 = Math.min(P.y + P.h, Math.round(P.y + (p.y + p.h) * 2));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Mean WCAG relative luminance of a box. */
function meanLum(px: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < px.length; i += 4) s += relLum(px[i]!, px[i + 1]!, px[i + 2]!);
  return s / (px.length / 4);
}

/**
 * Mean SSIM of two RGBA buffers' luma, the reference form (Wang et al. 2004): 11 x 11 Gaussian
 * window, sigma 1.5, K1 0.01, K2 0.03, L 255, over every window that fits.
 */
function ssim(a: Uint8Array, b: Uint8Array, w: number, h: number, preBlur = false): number {
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  const R = 5;
  const g: number[] = [];
  for (let i = -R; i <= R; i++) g.push(Math.exp(-(i * i) / (2 * 1.5 * 1.5)));
  const gs = g.reduce((x, y) => x + y, 0);
  for (let i = 0; i < g.length; i++) g[i]! /= gs;
  const Y = (px: Uint8Array) => {
    const out = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = luma(px[i * 4]!, px[i * 4 + 1]!, px[i * 4 + 2]!);
    return out;
  };
  let ya = Y(a);
  let yb = Y(b);
  // Separable Gaussian of a field (valid region only).
  const blur = (f: Float64Array) => {
    const tmp = new Float64Array(w * h);
    for (let y = 0; y < h; y++) for (let x = R; x < w - R; x++) { let s = 0; for (let k = -R; k <= R; k++) s += g[k + R]! * f[y * w + x + k]!; tmp[y * w + x] = s; }
    const out = new Float64Array(w * h);
    for (let y = R; y < h - R; y++) for (let x = R; x < w - R; x++) { let s = 0; for (let k = -R; k <= R; k++) s += g[k + R]! * tmp[(y + k) * w + x]!; out[y * w + x] = s; }
    return out;
  };
  const prod = (p: Float64Array, q: Float64Array) => p.map((v, i) => v * q[i]!);
  // A-95 ruling: grain loss is not figure loss, so both images may first take a sigma 1.5
  // Gaussian (the same kernel), which removes the 4% grain and keeps the figure.
  const m = preBlur ? 2 * R : R;
  if (preBlur) {
    ya = blur(ya);
    yb = blur(yb);
  }
  const ma = blur(ya), mb = blur(yb), saa = blur(prod(ya, ya)), sbb = blur(prod(yb, yb)), sab = blur(prod(ya, yb));
  let sum = 0;
  let n = 0;
  for (let y = m; y < h - m; y++)
    for (let x = m; x < w - m; x++) {
      const i = y * w + x;
      const mu1 = ma[i]!, mu2 = mb[i]!;
      const v1 = saa[i]! - mu1 * mu1, v2 = sbb[i]! - mu2 * mu2, cv = sab[i]! - mu1 * mu2;
      sum += ((2 * mu1 * mu2 + C1) * (2 * cv + C2)) / ((mu1 * mu1 + mu2 * mu2 + C1) * (v1 + v2 + C2));
      n++;
    }
  return sum / n;
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

// The window around each mark's own line: 0.1 cap above the strip mark (the line above can end in
// a decimal comma, ΔT -9,9 in de/es/pt, whose tail reaches 0.3 cap down towards the mark) and 0.3
// below; 0.15 above and below on the footer (the brackets of `[STORE NAME]` reach under its
// baseline), so the measured rows are the mark's glyphs alone and not the line above.
function marks(c: ReturnType<Mod['drawShareCard']>) {
  const [strip, footer] = c.marks;
  const sv = Math.round(strip!.h * 0.3);
  const s = measure(c.image, {
    x0: Math.round(strip!.x) - 4,
    y0: Math.max(c.strip.y, Math.round(strip!.y) - Math.round(strip!.h * 0.1)),
    x1: Math.min(c.strip.x + c.strip.w, Math.round(strip!.x + strip!.w) + 4),
    y1: Math.min(c.strip.y + c.strip.h, Math.round(strip!.baseline) + sv),
  });
  const pad = Math.round(footer!.h * 0.6);
  const fv = Math.round(footer!.h * 0.15);
  const f = measure(c.image, { x0: Math.round(footer!.x) - pad, y0: Math.round(footer!.y) - fv, x1: Math.round(footer!.x + footer!.w) + pad, y1: Math.round(footer!.baseline) + fv });
  return { s, f };
}

const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** The most common colour among the brightest pixels inside a mark's glyph box (its ink, where it is solid). */
function inkCore(img: any, m: { x: number; y: number; w: number; h: number }): number[] {
  const b = { x: Math.round(m.x), y: Math.round(m.y), w: Math.round(m.w), h: Math.round(m.h) };
  const px = pixels(img, b);
  const count = new Map<string, number>();
  let best = '';
  let bestN = 0;
  let maxL = 0;
  for (let i = 0; i < px.length; i += 4) maxL = Math.max(maxL, luma(px[i]!, px[i + 1]!, px[i + 2]!));
  for (let i = 0; i < px.length; i += 4) {
    if (luma(px[i]!, px[i + 1]!, px[i + 2]!) < maxL - 1) continue;
    const k = `${px[i]},${px[i + 1]},${px[i + 2]}`;
    const n = (count.get(k) ?? 0) + 1;
    count.set(k, n);
    if (n > bestN) [best, bestN] = [k, n];
  }
  return best.split(',').map(Number);
}

const CASES = [
  ['cellar', 'critical', true],
  ['bright', 'strong', false],
  ['outdoors', 'active', false],
  ['black', 'quiet', false],
] as const;

// Every locale runs the four fixtures (A-08, D-045 ruling 2): dark (cellar, CRITICAL deep), bright,
// mixed (outdoors) and QUIET on the black fixture, all after the tint.
const casesFor = (_lang: Lang) => CASES;

it('measures at least en, plus every locale file present', () => {
  expect(LOCALES).toContain('en');
  console.log(`share card locales: ${LOCALES.join(', ')}`);
});

describe.each(LOCALES)('SIMULATED mark (%s), measured from the rendered pixels', (lang) => {
  for (const format of ['story', 'square'] as const)
    for (const [fixture, name, deep] of casesFor(lang))
      it(`${format} ${fixture} ${name}${deep ? ' deep' : ''}`, () => {
        const c = card(fixture, name, format, deep, lang);
        // The measured boxes are the localised mark: last in the strip, and the footer's mark word.
        expect(c.text.locale).toBe(lang);
        expect(c.text.strip.mark).toBe(MARK_TABLE[lang].mark);
        expect(c.texts.filter((t) => t === c.text.strip.mark)).toHaveLength(1);
        expect(c.texts.indexOf(c.text.strip.mark)).toBe(c.texts.indexOf(`${c.text.reading.spi} `) - 1);
        expect(c.text.footer.endsWith(MARK_TABLE[lang].footer)).toBe(true);
        expect(MARK_TABLE[lang].footer.endsWith(c.text.footerMark)).toBe(true);
        expect([c.width, c.height]).toEqual(format === 'story' ? [1080, 1920] : [1080, 1080]);
        const { s, f } = marks(c);
        // D-034 (a): every strip run and the whole footer at the mark's size, nothing enlarged.
        expect(c.marks[0]!.fontSize).toBe(R.stripSize(c.layout));
        expect(c.marks[0]!.fontSize).toBeGreaterThanOrEqual(R.markSize(c.height, R.CAP_EM.vt323));
        expect(c.marks[1]!.fontSize).toBe(R.markSize(c.height, R.CAP_EM.b612));
        console.log(`${lang} ${format} ${fixture} ${name}: strip cap ${s.cap} px contrast ${s.contrast.toFixed(2)} (scrim ${c.strip.alpha}); footer cap ${f.cap} px contrast ${f.contrast.toFixed(2)}; strip y ${c.strip.y} to ${c.strip.y + c.strip.h}; floor ${(0.02 * c.height).toFixed(1)} px`);
        // The measured rows are the mark's own glyphs: no taller than the run's cap height plus antialiasing.
        expect(s.cap).toBeLessThanOrEqual(Math.ceil(c.marks[0]!.capPx) + 3);
        expect(f.cap).toBeLessThanOrEqual(Math.ceil(c.marks[1]!.capPx) + 3);
        for (const m of [s, f]) {
          expect(m.cap).toBeGreaterThanOrEqual(0.02 * c.height);
          expect(m.contrast).toBeGreaterThanOrEqual(4.5);
        }
        // Drawn after the tint, the scrim and the grain (A-08): the mark's glyph cores are exactly its
        // colour at 100% (p3 strip, n6 footer), with no grain or tint on them.
        expect(inkCore(c.image, c.marks[0]!)).toEqual(rgbOf('#4FB46A'));
        expect(inkCore(c.image, c.marks[1]!)).toEqual(rgbOf('#C9C7B6'));
        if (format === 'story') {
          // The strip (scrim and ink) sits inside the story safe zone y 250 to 1580.
          expect(s.top).toBeGreaterThanOrEqual(250);
          expect(c.strip.y).toBeGreaterThanOrEqual(250);
          expect(c.strip.y + c.strip.h).toBeLessThanOrEqual(1580);
          expect(s.bottom).toBeLessThanOrEqual(1580);
        }
      }, 60000);
});

describe('reading row (D-034 b), measured from the rendered pixels', () => {
  for (const format of ['story', 'square'] as const)
    for (const deep of [true, false])
      it(`${format} ${deep ? 'deep: EVP line' : 'undecoded: SIGNATURE line'}`, () => {
        const c = card('cellar', 'strong', format, deep);
        const [spi, tier, line, detail] = c.readingLines;
        const capOf = (l: typeof spi) => measure(c.image, { x0: Math.round(l!.x), y0: Math.round(l!.capTop - 0.15 * (l!.baseline - l!.capTop)), x1: Math.round(l!.x + 0.5 * l!.fontSize * Math.min(6, l!.text.length)), y1: l!.baseline + 1 }).cap;
        expect(line!.text).toMatch(deep ? /^EVP ".+"$/ : /^SIGNATURE \d+% DECODED$/);
        expect(line!.color).toBe(tier!.color); // p5: as bright as the tier word, brighter than anything after it
        const lineCap = capOf(line);
        console.log(`${format} ${deep ? 'deep' : 'undecoded'}: SPI/tier ${spi!.fontSize} px (cap ${capOf(spi)}), line ${line!.fontSize} px (cap ${lineCap})${detail ? `, detail ${detail.fontSize} px` : ''}`);
        if (format === 'story') {
          expect(spi!.fontSize).toBeGreaterThanOrEqual(90);
          expect(line!.fontSize).toBeGreaterThanOrEqual(44);
          expect(c.layout.reading.y).toBeGreaterThanOrEqual(c.layout.photo.y + c.layout.photo.h + 4);
        } else {
          expect(lineCap).toBeGreaterThanOrEqual(34);
        }
        if (deep) expect(detail!.color).not.toBe(line!.color);
        else expect(detail).toBeUndefined();
      }, 60000);
});

describe('card contents', () => {
  it.each(LOCALES)('is byte-identical for a fixed seed (%s)', (lang) => {
    const a = R.encodePng(card('cellar', 'active', 'story', false, lang).image);
    const b = R.encodePng(card('cellar', 'active', 'story', false, lang).image);
    expect(a.length).toBeGreaterThan(1000);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  }, 60000);

  it('en: the default locale and the explicit en override draw the same bytes', () => {
    const a = R.encodePng(card('cellar', 'critical', 'story', true).image);
    const b = R.encodePng(card('cellar', 'critical', 'story', true, 'en').image);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  }, 60000);

  it.each(LOCALES)('draws the localised set only (%s): mark per D-038, no English mark outside en', async (lang) => {
    const { translate } = await import('../../../i18n/core');
    const tr = (k: string, p?: Record<string, string | number>) => translate(lang, k, p);
    // The card mark is the on-screen strip's mark, in every locale (one record, two surfaces).
    expect(tr('share.card.mark')).toBe(tr('result.strip.mark'));
    const dot = lang === 'en' ? '\\.' : ',';
    for (const [fixture, name, format, deep] of [['cellar', 'critical', 'square', true], ['cellar', 'active', 'story', false], ['black', 'quiet', 'story', false]] as const) {
      const c = card(fixture, name, format, deep, lang);
      const t = c.text;
      expect(t.strip.data).toMatch(new RegExp(`ΔT -?\\d+${dot}\\d °C`));
      expect(t.strip.lines[1]).toMatch(new RegExp(`^CASE \\d{4}  ΔT -?\\d+${dot}\\d °C$`));
      expect(t.footer).toBe(tr('share.card.footer', { store: '[STORE NAME]' }));
      const rec = demo.demoRecord(name, 'x', demo.DEMO_CASES[name]);
      const want = deep
        ? tr('share.card.evp', { line: tr(`deep.evp.${(rec.seed >>> 0) % 12}`) })
        : name === 'quiet'
          ? tr('share.card.none')
          : tr('share.card.decoded', { pct: rec.profile.signatureDecodedPct });
      expect(t.reading.line).toBe(want);
      // Every drawn run is a piece of the card's own strings (lines break only at ` · `).
      const pieces = new Set([t.nameplate, R.CARD_IDENTITY.serial, t.strip.mark, t.reading.spi + ' ', t.reading.tier, t.reading.line, ...(t.reading.detail ? [t.reading.detail] : []), t.footer, ...t.footer.split(' · ')]);
      const words = new Set(t.footer.split(/ · | /));
      for (const run of c.texts) expect(pieces.has(run) || t.strip.lines.includes(run) || run.split(' ').every((w) => words.has(w))).toBe(true);
      expect(c.texts.at(-1)!.endsWith(MARK_TABLE[lang].footer)).toBe(true);
      if (lang !== 'en') for (const run of c.texts) expect(run).not.toMatch(/SIMULATED|READINGS/);
    }
  }, 60000);

  it("prints the install's serial on the nameplate, as the screen's nameplate does", async () => {
    const { identityFromSeed, FIXED_SEED } = await import('../../../ui/boot/install');
    // The harness identity is the fixed-seed install the app shows (FS4-8711-00417-9).
    expect(R.CARD_IDENTITY.serial).toBe(identityFromSeed(FIXED_SEED, new Date(2026, 9, 13)).serial);
    expect(R.CARD_IDENTITY.serial).toBe('FS4-8711-00417-9');
    for (const format of ['story', 'square'] as const) {
      const c = card('cellar', 'critical', format);
      expect(c.texts.slice(0, 2)).toEqual(['VELDEN  FS-4/87-P', 'FS4-8711-00417-9']);
      // Ink in the plate's right third: the serial is drawn there (a bare plate is flat n5 with a 6 px scuff).
      const b = c.layout.plate;
      const px = pixels(c.image, { x: Math.round(b.x + b.w * 0.62), y: Math.round(b.y + b.h * 0.3), w: Math.round(b.w * 0.3), h: Math.round(b.h * 0.4) });
      let dark = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i]! < 90) dark++;
      expect(dark, format).toBeGreaterThan(400);
    }
    // Another install's identity reaches the plate.
    const photo = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(readBytes('e2e/fixtures/cellar.png')));
    const record = demo.demoRecord('active', 'fixture', demo.DEMO_CASES.active);
    const other = R.drawShareCard({ record, format: 'story', photo, stats: null, fonts, identity: { serial: 'FS4-8802-01234-5', cal: '2026-01-02', pruef: '03' } });
    photo.dispose();
    made.push(other.image);
    expect(other.texts[1]).toBe('FS4-8802-01234-5');
  }, 60000);

  it('draws only the brief strings: no key, QR, arrow, link or claim word', () => {
    const c = card('cellar', 'critical', 'square', true);
    expect(c.fileName).toBe('field-card-0004-simulated.png');
    expect(c.texts).toEqual([
      'VELDEN  FS-4/87-P',
      'FS4-8711-00417-9',
      expect.stringMatching(/^\d\d:\d\d  \d{4}-\d\d-\d\d$/),
      expect.stringMatching(/^CASE 0004  ΔT -?\d+\.\d °C$/),
      'SIMULATED',
      expect.stringMatching(/^\d+ $/),
      'CRITICAL',
      expect.stringMatching(/^EVP ".+"$/),
      expect.stringMatching(/^CLASS: [A-Z-]+ · ERA EST\. \d{4} TO \d{4}$/),
      '[STORE NAME] · READINGS ARE SIMULATED',
    ]);
    // A-90: the data back on both formats (time and date, case and ΔT, SIMULATED last; SPI only in
    // the reading row); the story footer breaks at its dot.
    const plain = card('cellar', 'active', 'story');
    expect(plain.texts).toEqual([
      'VELDEN  FS-4/87-P',
      'FS4-8711-00417-9',
      expect.stringMatching(/^\d\d:\d\d  \d{4}-\d\d-\d\d$/),
      expect.stringMatching(/^CASE 0007  ΔT -?\d+\.\d °C$/),
      'SIMULATED',
      expect.stringMatching(/^\d+ $/),
      'ACTIVE',
      expect.stringMatching(/^SIGNATURE \d+% DECODED$/),
      '[STORE NAME]',
      'READINGS ARE SIMULATED',
    ]);
    expect(plain.marks[0]!.x).toBe(plain.strip.x + Math.round(plain.layout.photo.w * 0.02));
    expect(card('black', 'quiet', 'story').texts[7]).toBe('NO SIGNATURE');
    for (const t of [...c.texts, ...plain.texts]) expect(t).not.toMatch(/SPI/);
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
    photo.dispose();
  });
});

// A-08 + A-95 (D-045 ruling 2): the photo takes the viewfinder's phosphor tint; the figure must keep
// its light through it and through a quality-70 JPEG re-encode (what a messenger does to a share).
describe('photo tint, figure contrast and re-encode (A-08, A-95)', () => {
  const FIGURES = [
    ['cellar', 'critical'],
    ['bright', 'strong'],
    ['outdoors', 'active'],
  ] as const;
  for (const format of ['story', 'square'] as const)
    for (const [fixture, name] of FIGURES)
      it(`${format} ${fixture} ${name}: figure-box contrast after the tint at least 85% of before; SSIM at q70 at least 0.9`, () => {
        const on = card(fixture, name, format);
        const box = figureBox(on);
        const onU = card(fixture, name, format, false, undefined, { fx: { tint: false } });
        const off = card(fixture, name, format, false, undefined, { fx: { ghost: false } });
        const offU = card(fixture, name, format, false, undefined, { fx: { tint: false, ghost: false } });
        // Ruling on the 85% rule: WCAG luminance contrast between the figure box and its surround (a
        // ring half the box wide on every side, inside the photo window), excess over 1, tinted
        // against untinted. The figure's Weber lift over the same box without it is logged only.
        const P = on.layout.photo;
        const ox = Math.round(Math.max(P.x, box.x - box.w / 2));
        const oy = Math.round(Math.max(P.y, box.y - box.h / 2));
        const outer = { x: ox, y: oy, w: Math.round(Math.min(P.x + P.w, box.x + 1.5 * box.w)) - ox, h: Math.round(Math.min(P.y + P.h, box.y + 1.5 * box.h)) - oy };
        const surround = (img: any) => {
          const px = pixels(img, outer);
          let t = 0;
          let n = 0;
          for (let y = 0; y < outer.h; y++)
            for (let x = 0; x < outer.w; x++) {
              const gx = outer.x + x;
              const gy = outer.y + y;
              if (gx >= box.x && gx < box.x + box.w && gy >= box.y && gy < box.y + box.h) continue;
              const i = (y * outer.w + x) * 4;
              t += relLum(px[i]!, px[i + 1]!, px[i + 2]!);
              n++;
            }
          return t / n;
        };
        const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const after = ratio(meanLum(pixels(on.image, box)), surround(on.image));
        const before = ratio(meanLum(pixels(onU.image, box)), surround(onU.image));
        const share = (after - 1) / (before - 1);
        const [yOn, yOff, yOnU, yOffU] = [on, off, onU, offU].map((c) => meanLum(pixels(c.image, box)));
        const weber = (yOn! - yOff!) / yOff! / ((yOnU! - yOffU!) / yOffU!);
        // SSIM of the figure box: the tinted card against its own JPEG q70 re-encode.
        const jpg = on.image.encodeToBytes(R_IMAGE_FORMAT.JPEG, 70);
        const back = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(jpg));
        made.push(back);
        const a0 = pixels(on.image, box);
        const b0 = pixels(back, box);
        const raw = ssim(a0, b0, box.w, box.h);
        const s = ssim(a0, b0, box.w, box.h, true);
        console.log(`[fig] ${format} ${fixture} ${name}: mix ${on.tintMix} lift ${on.tintLift} box ${box.w}x${box.h} box/surround contrast before ${before.toFixed(3)} after ${after.toFixed(3)} (excess ${share.toFixed(3)} of before); figure Weber lift ${weber.toFixed(3)} of before; SSIM q70 ${s.toFixed(4)} (raw ${raw.toFixed(4)})`);
        expect(before).toBeGreaterThan(1);
        expect(share).toBeGreaterThanOrEqual(0.85);
        expect(s).toBeGreaterThanOrEqual(0.9);
      }, 120000);

  it('takes one hue: the tinted photo window leans to the phosphor green on every fixture', () => {
    for (const [fixture, name] of [...FIGURES, ['black', 'quiet']] as const) {
      const c = card(fixture, name, 'story');
      const u = card(fixture, name, 'story', false, undefined, { fx: { tint: false } });
      const P = c.layout.photo;
      const box = { x: P.x, y: P.y, w: P.w, h: Math.round(P.h * 0.6) };
      const mean = (px: Uint8Array) => [0, 1, 2].map((ch) => { let t = 0; for (let i = ch; i < px.length; i += 4) t += px[i]!; return t / (px.length / 4); });
      const [r, g, b] = mean(pixels(c.image, box));
      const [ru, gu, bu] = mean(pixels(u.image, box));
      console.log(`[tint] ${fixture}: untinted rgb ${[ru, gu, bu].map((v) => v!.toFixed(1)).join(' ')} -> tinted ${[r, g, b].map((v) => v!.toFixed(1)).join(' ')}`);
      expect(g!).toBeGreaterThan(r!);
      expect(g!).toBeGreaterThan(b!);
      expect(g! - Math.max(r!, b!)).toBeGreaterThan(gu! - Math.max(ru!, bu!));
    }
  }, 120000);
});

// A-45: a near-black photo is gained (QUIET has no figure, so the black fixture tests it).
describe('auto-gain on a near-black photo (A-45)', () => {
  it('lifts the black fixture to about p1 and leaves lit scenes alone', () => {
    const c = card('black', 'quiet', 'story');
    const u = card('black', 'quiet', 'story', false, undefined, { fx: { tint: false } });
    expect(c.figure).toBeNull();
    const P = c.layout.photo;
    const box = { x: P.x, y: P.y, w: P.w, h: Math.round(P.h * 0.6) };
    const meanLuma = (px: Uint8Array) => { let t = 0; for (let i = 0; i < px.length; i += 4) t += luma(px[i]!, px[i + 1]!, px[i + 2]!); return t / (px.length / 4); };
    const m = meanLuma(pixels(c.image, box));
    const p1 = luma(0x1c, 0x4a, 0x2a);
    console.log(`[gain] black quiet: +${c.gainDb} dB, photo mean luma ${m.toFixed(1)} (untinted ${meanLuma(pixels(u.image, box)).toFixed(1)}, fixture 2.3; p1 ${p1.toFixed(1)})`);
    expect(c.gainDb).toBe(24);
    expect(m).toBeGreaterThanOrEqual(p1 * 0.75);
    expect(m).toBeLessThanOrEqual(p1 * 1.3);
    for (const [fixture, name] of [['cellar', 'critical'], ['bright', 'strong'], ['outdoors', 'active']] as const) expect(card(fixture, name, 'square').gainDb).toBe(0);
  }, 120000);
});

// A-93, A-97, A-91: the LED plate, the score row and the footer.
describe('LED plate, score row and footer (A-93, A-97, A-91)', () => {
  it.each(['quiet', 'active', 'strong', 'critical'] as const)('lights the tier count, LED 5 red on CRITICAL only (%s)', (name) => {
    const want = { quiet: 1, active: 3, strong: 4, critical: 5 }[name];
    for (const format of ['story', 'square'] as const) {
      const c = card(name === 'quiet' ? 'black' : 'cellar', name, format);
      expect(c.leds.lit).toBe(want);
      expect(c.leds.red).toBe(name === 'critical');
      // Measured: the lens centre pixel is lit (luma over 100) for the first `want` LEDs only; red only on LED 5 of CRITICAL.
      c.leds.lenses.forEach((l, i) => {
        const [r, g, b] = pixels(c.image, { x: Math.round(l.cx), y: Math.round(l.cy + l.r * 0.3), w: 1, h: 1 });
        const lit = luma(r!, g!, b!) > 100;
        expect(lit).toBe(i < want);
        expect(r! > g! + 60).toBe(name === 'critical' && i === 4);
      });
      const L = c.layout;
      expect(L.leds.x).toBeGreaterThanOrEqual(L.reading.x + L.reading.w);
      expect(L.leds.x + L.leds.w).toBeLessThanOrEqual(L.width);
    }
  }, 120000);

  it('sets SPI and tier at 96 px on both formats, the photo window unchanged', () => {
    for (const format of ['story', 'square'] as const) {
      const c = card('cellar', 'critical', format, true);
      expect(c.readingLines[0]!.fontSize).toBe(96);
      expect(c.readingLines.at(-1)!.baseline).toBeLessThanOrEqual(c.layout.reading.y + c.layout.reading.h);
    }
  }, 60000);

  it('prints the footer left-aligned, whole, in every locale and with a long store name', () => {
    for (const lang of LOCALES)
      for (const format of ['story', 'square'] as const)
        for (const store of ['[STORE NAME]', 'VELDEN FS-4 FIELD PROBE']) {
          const c = card('cellar', 'active', format, false, lang, { store });
          const t = c.text;
          const start = c.texts.indexOf(t.reading.line) + 1;
          const lines = c.texts.slice(start);
          // Never truncated: the drawn lines are the sentence's words, every one, in order.
          expect(lines.join(' ').split(/ · | /).join(' ')).toBe(t.footer.split(/ · | /).join(' '));
          if (format === 'square' && store === '[STORE NAME]') expect(lines).toHaveLength(1);
          expect(c.marks[1]!.fontSize).toBe(R.markSize(c.height, R.CAP_EM.b612));
          expect(c.marks[1]!.baseline).toBeLessThanOrEqual(c.height - 6);
          for (const img of made.splice(0)) img.dispose();
        }
  }, 180000);
});
