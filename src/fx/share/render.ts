import { AlphaType, ClipOp, ColorType, ImageFormat, PaintStyle, processUniforms, Skia, TileMode, type SkCanvas, type SkImage, type SkRuntimeEffect, type SkTypeface } from '@shopify/react-native-skia';

import type { Lang } from '../../i18n';
import type { ScanRecord } from '../../state/scans';
import { color } from '../../ui/tokens';
import { mulberry32 } from '../../engine';
import { drawComposite, imageShader } from '../compositor/offscreen';
import type { RegionStats } from '../compositor/regionFromImage';
import { GRAIN_FREQ } from '../compositor/setup';
import {
  CARD_HIRES,
  cardFileName,
  LAYOUTS,
  MARK_CAP_FRAC,
  MARK_CONTRAST_TARGET,
  MARK_SAFETY,
  STORE_NAME,
  STRIP_SCRIM_MIN,
  type Box,
  type CardFormat,
  type CardLayout,
} from './constants';
import { figureLayout, plainTop, type FigureLayout } from './figure';
import { cardText, type CardText } from './text';

// The share card, drawn offscreen on a CPU raster surface (same pixels on every run and backend
// family): housing (with the Bible's fasteners, sticker and wear outside the safe zone),
// nameplate, the composite with the data strip burned under the grain, the reading row and the
// footer. Nothing else: no key, no QR code, no arrow or box near the figure.
//
// D-034 (a): every strip run is drawn at the mark's size, so the strip and SIMULATED read as one
// burned record. Where the record does not fit on one line (the story card), the case data breaks
// at its ` · ` joints and SIMULATED takes the last line, left-aligned, on the same baseline grid.

export interface CardFonts {
  /** VT323 (readouts: strip, reading row). */
  vt323: SkTypeface;
  /** B612 Mono Regular (footer) and Bold (nameplate, the Bible's lbM). */
  b612: SkTypeface;
  b612Bold: SkTypeface;
}

export interface CardInput {
  record: ScanRecord;
  format: CardFormat;
  /** The decoded photo (record.photoUri). */
  photo: SkImage;
  /** The compositor's region statistics for the photo (`regionFromImage`), or null. */
  stats: RegionStats | null;
  fonts: CardFonts;
  /** BELIEF_PROFILE[belief].opacityRange, as the result screen passes it. */
  beliefBand?: [number, number];
  store?: string;
  /** Locale override for the card's strings (probe and tests); default the locale in force. */
  locale?: Lang;
}

/** Where a SIMULATED token was drawn, in card pixels. */
export interface MarkBox {
  kind: 'strip' | 'footer';
  /** Glyph run box: x to x + w, cap top to baseline. */
  x: number;
  y: number;
  w: number;
  h: number;
  baseline: number;
  fontSize: number;
  /** Cap height the font gives at that size (VT323 0.56 em, B612 Mono 0.76 em). */
  capPx: number;
}

export interface ReadingLine {
  text: string;
  x: number;
  fontSize: number;
  capTop: number;
  baseline: number;
  color: string;
}

export interface CardRender {
  format: CardFormat;
  width: number;
  height: number;
  image: SkImage;
  fileName: string;
  text: CardText;
  /** Every run drawn, in draw order (the strip and the footer as broken into lines). */
  texts: string[];
  marks: MarkBox[];
  /** The strip's scrim box in card pixels and the alpha chosen for it. */
  strip: Box & { alpha: number };
  layout: CardLayout;
  /** Reading row lines as drawn: font size, cap top and baseline in card pixels, colour. */
  readingLines: ReadingLine[];
  /** The figure as placed on the card (logical panel pixels), or null when the record shows none. */
  figure: FigureLayout | null;
}

/** Cap height per em, measured on the bundled TTFs (CanvasKit, glyph rows of `EHILT`). */
export const CAP_EM = { vt323: 0.56, b612: 0.76 } as const;
/** On-screen strip: VT323 16 px across a 366 px glass, scaled to the card's photo width (the strip's size where that clears the mark floor). */
export const STRIP_EM_PER_W = 16 / 366;
/** Baseline pitch of the strip's and the footer's lines, as a multiple of the cap height. */
const STRIP_PITCH = 1.5;
const FOOTER_PITCH = 1.45;
/** Reading row: [SPI and tier, line, detail] font sizes and the gap between cap boxes (D-034 b). */
const READING = {
  story: { sizes: [96, 62, 42], gap: 24 },
  square: { sizes: [80, 62, 36], gap: 18 },
} as const;
/** Housing texture: signed noise amplitude and the corner falloff (Bible section 2: 6%). */
const HOUSING_NOISE = 0.025;
const HOUSING_FALL = 0.06;

const HOUSING_SKSL = `
uniform shader noise;
uniform float2 size;
uniform float3 base;
uniform float amp;
uniform float fall;
half4 main(float2 xy) {
  half4 n = noise.eval(xy);
  float v = n.a > 0.0 ? n.r / n.a : 0.5;
  float2 d = (xy / size - 0.5) * 2.0;
  float r = clamp(dot(d, d) * 0.5, 0.0, 1.0);
  half3 c = half3(base * (1.0 - fall * r) + (v - 0.5) * 2.0 * amp);
  return half4(clamp(c, 0.0, 1.0), 1.0);
}`;

/** The compositor's grain step (COMPOSITE_SKSL's last line) on its own, for after the strip. */
const GRAIN_SKSL = `
uniform shader img;
uniform shader noise;
uniform float grain;
half4 main(float2 xy) {
  half4 c = img.eval(xy);
  half4 n = noise.eval(xy);
  float v = n.a > 0.0 ? n.r / n.a : 0.5;
  float g = clamp((v - 0.5) * 4.0, -1.0, 1.0) * grain;
  return half4(clamp(c.rgb + g, 0.0, 1.0), 1.0);
}`;

const effects: Record<string, SkRuntimeEffect> = {};
function effect(name: string, src: string): SkRuntimeEffect {
  const e = effects[name] ?? Skia.RuntimeEffect.Make(src);
  if (!e) throw new Error(`share card: ${name} shader failed to compile`);
  effects[name] = e;
  return e;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG 2.x relative luminance of 0..255 sRGB channels. */
export function luminance([r, g, b]: readonly number[]): number {
  const f = (v: number) => {
    const c = Math.min(1, Math.max(0, v / 255));
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
}

export const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * Least scrim alpha (from STRIP_SCRIM_MIN) that keeps `text` at MARK_CONTRAST_TARGET over the
 * brightest channels under the strip, with the grain pushing the text down and the ground up.
 */
export function scrimAlpha(maxRgb: readonly number[], text: readonly number[], grain255: number): number {
  const n0 = rgb(color.n0);
  const lt = luminance(text.map((v) => v - grain255));
  for (let a = STRIP_SCRIM_MIN; a < 1; a += 0.01) {
    const bg = maxRgb.map((v, i) => a * n0[i]! + (1 - a) * v + grain255);
    if (contrast(lt, luminance(bg)) >= MARK_CONTRAST_TARGET) return Math.round(a * 100) / 100;
  }
  return 1;
}

/** Font size whose cap height clears the mark floor for a card of height `h`. */
export function markSize(h: number, capEm: number): number {
  return Math.ceil((MARK_CAP_FRAC * h * MARK_SAFETY) / capEm);
}

/** One size for every strip run: the mark floor, or the on-screen strip scaled to the photo if larger (square: 47 px, cap 27). */
export function stripSize(L: CardLayout): number {
  return Math.max(markSize(L.height, CAP_EM.vt323), Math.round(STRIP_EM_PER_W * L.photo.w));
}

function paintOf(hex: string, alpha = 1) {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(hex));
  if (alpha < 1) p.setAlphaf(alpha);
  return p;
}

function text(canvas: SkCanvas, s: string, x: number, y: number, face: SkTypeface, size: number, hex: string, alpha = 1): number {
  const font = Skia.Font(face, size);
  canvas.drawText(s, x, y, paintOf(hex, alpha), font);
  return font.getTextWidth(s);
}

const width = (s: string, face: SkTypeface, size: number) => Skia.Font(face, size).getTextWidth(s);

/** Boxes the card paints opaque over the housing (whole pixels): the photo surround and the reading box's straight-edged core. */
export function housingCovered(L: CardLayout): Box[] {
  const P = L.photo;
  const b = L.reading;
  const r = Math.ceil(6 * (L.width / 390)); // the reading box's corner radius (drawReading), rounded up
  return [
    { x: P.x - 4, y: P.y - 4, w: P.w + 8, h: P.h + 8 },
    { x: b.x + r, y: b.y, w: b.w - 2 * r, h: b.h },
    { x: b.x, y: b.y + r, w: b.w, h: b.h - 2 * r },
  ];
}

function drawHousing(canvas: SkCanvas, L: CardLayout, seed: number) {
  const fx = effect('housing', HOUSING_SKSL);
  const base = rgb(color.n3).map((v) => v / 255);
  const noise = Skia.Shader.MakeFractalNoise(0.35, 0.35, 3, seed % 997, 0, 0);
  const p = Skia.Paint();
  p.setShader(fx.makeShaderWithChildren(processUniforms(fx, { size: [L.width, L.height], base, amp: HOUSING_NOISE, fall: HOUSING_FALL }), [noise]));
  // P8-03: the texture is not shaded where opaque paint covers it later: the photo with its 4 px
  // surround, and the reading box inside its corner radius. Same bytes, about 60% fewer pixels
  // through the noise shader on the story card.
  canvas.save();
  for (const r of housingCovered(L)) canvas.clipRect(Skia.XYWHRect(r.x, r.y, r.w, r.h), ClipOp.Difference, false);
  canvas.drawRect(Skia.XYWHRect(0, 0, L.width, L.height), p);
  canvas.restore();
  // Cast edge: 1 px n4 highlight on top, 2 px n1 shadow at the bottom (Bible section 2).
  canvas.drawRect(Skia.XYWHRect(0, 0, L.width, 2), paintOf(color.n4));
  canvas.drawRect(Skia.XYWHRect(0, L.height - 4, L.width, 4), paintOf(color.n1));
  // Paint rubbed through to n4 on both long edges where thumbs grip (Bible section 2), seeded.
  const r = mulberry32((seed ^ 0x51ed) >>> 0);
  const k = L.width / 390;
  for (const x of [0, L.width - 3 * k]) {
    const h = (40 + r() * 30) * k;
    const y = L.height * (0.3 + r() * 0.4);
    canvas.drawRect(Skia.XYWHRect(x, y, 3 * k, h), paintOf(color.n4, 0.55));
  }
}

/** Phillips screw head: rim, face, top-left light, cross slot at a seeded angle, optional burr. */
function drawScrew(canvas: SkCanvas, cx: number, cy: number, rad: number, angle: number, burred: boolean) {
  canvas.drawCircle(cx + 1, cy + 2, rad, paintOf(color.n1, 0.7));
  canvas.drawCircle(cx, cy, rad, paintOf(color.n4));
  canvas.drawCircle(cx, cy, rad * 0.84, paintOf(color.n5));
  canvas.drawCircle(cx - rad * 0.3, cy - rad * 0.3, rad * 0.38, paintOf(color.n6, 0.3));
  canvas.save();
  canvas.translate(cx, cy);
  canvas.rotate(angle, 0, 0);
  const sw = Math.max(2, rad * 0.2);
  const sl = rad * 1.1;
  canvas.drawRect(Skia.XYWHRect(-sl / 2, -sw / 2, sl, sw), paintOf(color.n2));
  canvas.drawRect(Skia.XYWHRect(-sw / 2, -sl / 2, sw, sl), paintOf(color.n2));
  // Burred: a 1 px brighter notch at one slot end (one screw per card, seeded).
  if (burred) canvas.drawRect(Skia.XYWHRect(sl / 2 - sw, -sw / 2 - 1, sw, 1.5), paintOf(color.n6, 0.85));
  canvas.restore();
}

/** Calibration sticker: textless printed fields, rotated -1.5°, one corner lifted with a shadow. */
function drawSticker(canvas: SkCanvas, x: number, y: number, w: number, h: number) {
  canvas.save();
  canvas.translate(x, y);
  canvas.rotate(-1.5, 0, 0);
  canvas.drawRect(Skia.XYWHRect(2, 3, w, h), paintOf(color.n1, 0.55));
  // The lifted bottom-right corner throws a longer shadow.
  canvas.drawRect(Skia.XYWHRect(w - h * 0.3, h - h * 0.3 + 2, h * 0.3 + 3, h * 0.3 + 3), paintOf(color.n1, 0.5));
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paintOf(color.n6, 0.62));
  const u = h / 10;
  // Printed header band and ruled fields, faded to the housing's ramp (no legible text).
  canvas.drawRect(Skia.XYWHRect(u, u, w - 2 * u, 2.2 * u), paintOf(color.n3, 0.75));
  for (let i = 0; i < 3; i++) canvas.drawRect(Skia.XYWHRect(u, 4.6 * u + i * 1.8 * u, w * 0.62, Math.max(1, u * 0.22)), paintOf(color.n3, 0.6));
  const box = Skia.Paint();
  box.setAntiAlias(true);
  box.setStyle(PaintStyle.Stroke);
  box.setStrokeWidth(Math.max(1, u * 0.22));
  box.setColor(Skia.Color(color.n3));
  box.setAlphaf(0.6);
  for (let i = 0; i < 3; i++) canvas.drawRect(Skia.XYWHRect(w * 0.72 + i * 1.7 * u, 4.4 * u, 1.3 * u, 1.3 * u), box);
  canvas.drawRect(Skia.XYWHRect(w * 0.72, 7.2 * u, 1.3 * u, 1.3 * u), paintOf(color.n3, 0.6));
  // The lifted corner: a folded triangle, lit, clipped to the sticker's corner.
  const c = h * 0.3;
  canvas.save();
  canvas.clipRect(Skia.XYWHRect(w - c, h - c, c, c), ClipOp.Intersect, true);
  canvas.drawRect(Skia.XYWHRect(w - c, h - c, c, c), paintOf(color.n3));
  canvas.translate(w, h);
  canvas.rotate(45, 0, 0);
  canvas.drawRect(Skia.XYWHRect(-c, -c * 0.71, 2 * c, c), paintOf(color.n6, 0.85));
  canvas.restore();
  canvas.restore();
}

/** Wear streaks: thin paint rubs to n4 in a band, seeded, never in the safe zone. */
function drawWear(canvas: SkCanvas, r: () => number, x0: number, x1: number, y0: number, y1: number, n: number) {
  for (let i = 0; i < n; i++) {
    const w = 20 + r() * 70;
    const x = x0 + r() * Math.max(1, x1 - x0 - w);
    const y = y0 + r() * (y1 - y0);
    canvas.drawRect(Skia.XYWHRect(x, y, w, 1 + r() * 1.5), paintOf(color.n4, 0.35 + r() * 0.3));
    if (r() < 0.5) canvas.drawRect(Skia.XYWHRect(x + w * 0.2, y + 2, w * 0.5, 1), paintOf(color.n6, 0.12));
  }
}

/** Fasteners, sticker and wear in the housing's dead bands (Bible section 2), outside the safe zone. */
function drawHousingDetail(canvas: SkCanvas, L: CardLayout, footer: { top: number; bottom: number; x0: number; x1: number }, seed: number) {
  const r = mulberry32((seed ^ 0x5c3e) >>> 0);
  const story = L.height > L.width;
  const burred = Math.floor(r() * 4);
  const angle = () => 15 + r() * 150;
  const fy = (footer.top + footer.bottom) / 2;
  if (story) {
    const top = L.plate.y; // band 0 to the nameplate, above the safe zone
    drawWear(canvas, r, 24, L.width - 24, 14, top - 30, 7);
    drawWear(canvas, r, 8, footer.x0 - 70, footer.top - 4, L.height - 10, 2);
    drawWear(canvas, r, footer.x1 + 70, L.width - 8, footer.top - 4, L.height - 10, 2);
    const screws = [
      [56, top * 0.42],
      [L.width - 56, top * 0.42],
      [56, fy],
      [L.width - 56, fy],
    ] as const;
    screws.forEach(([x, y], i) => drawScrew(canvas, x, y, 15, angle(), i === burred));
    drawSticker(canvas, L.width - 300, top * 0.3, 168, 70);
  } else {
    drawWear(canvas, r, 90, L.width - 90, 6, L.plate.y - 6, 4);
    drawWear(canvas, r, 60, L.width - 60, footer.bottom + 8, L.height - 8, 3);
    const screws = [
      [32, L.plate.y + L.plate.h / 2],
      [L.width - 32, L.plate.y + L.plate.h / 2],
      [24, fy],
      [L.width - 24, fy],
    ] as const;
    screws.forEach(([x, y], i) => drawScrew(canvas, x, y, 12, angle(), i === burred));
    drawSticker(canvas, footer.x1 + 26, fy - 18, 78, 36);
  }
}

function drawNameplate(canvas: SkCanvas, L: CardLayout, fonts: CardFonts, label: string, seed: number) {
  const b = L.plate;
  const k = L.width / 390;
  canvas.drawRect(Skia.XYWHRect(b.x + 2, b.y + 3, b.w, b.h), paintOf(color.n1, 0.6));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(b.x, b.y, b.w, b.h), 2 * k, 2 * k), paintOf(color.n5));
  canvas.drawRect(Skia.XYWHRect(b.x, b.y, b.w, 2), paintOf(color.n6, 0.35));
  canvas.drawRect(Skia.XYWHRect(b.x, b.y + b.h - 2, b.w, 2), paintOf(color.n4));
  // Engraved border: a cut groove (n4) with its lit lower lip (n6), inset inside the rivets.
  const ix = b.x + 16 * k;
  const iw = b.w - 32 * k;
  for (const gy of [b.y + 7, b.y + b.h - 9]) {
    canvas.drawRect(Skia.XYWHRect(ix, gy, iw, 1.5), paintOf(color.n4, 0.9));
    canvas.drawRect(Skia.XYWHRect(ix, gy + 1.5, iw, 1), paintOf(color.n6, 0.35));
  }
  const cy = b.y + b.h / 2;
  // Rivets: domed, two at each end (Bible: 4 px rivets 8 px in), lit from above.
  for (const cx of [b.x + 8 * k, b.x + b.w - 8 * k]) {
    for (const dy of [-b.h * 0.22, b.h * 0.22]) {
      canvas.drawCircle(cx + 0.5, cy + dy + 1.5, 2 * k, paintOf(color.n1, 0.5));
      canvas.drawCircle(cx, cy + dy, 2 * k, paintOf(color.n4));
      canvas.drawCircle(cx, cy + dy, 1.5 * k, paintOf(color.n5));
      canvas.drawCircle(cx - 1.5, cy + dy - 1.5, 0.7 * k, paintOf(color.n6, 0.7));
    }
  }
  // A 6 px scuff on the plate (Bible section 2), seeded.
  const r = mulberry32((seed ^ 0x5c0f) >>> 0);
  canvas.drawRect(Skia.XYWHRect(b.x + b.w * (0.55 + r() * 0.3), cy + (r() - 0.5) * b.h * 0.5, 6 * k, 1.2 * k), paintOf(color.n4, 0.7));
  // Engraved: the n2 text over a faint lit lower lip. lbM (13 px at 390), B612 Mono Bold.
  const size = Math.round(13 * k * 0.85);
  const base = cy + (CAP_EM.b612 * size) / 2;
  const x = b.x + 18 * k;
  text(canvas, label, x, base + 1.5, fonts.b612Bold, size, color.n6, 0.45);
  text(canvas, label, x, base, fonts.b612Bold, size, color.n2);
}

/** Reading row: SPI and tier near 96 px, the EVP or decoded line in p5, class and era in p3. */
function drawReading(canvas: SkCanvas, L: CardLayout, fonts: CardFonts, t: CardText['reading'], critical: boolean): { runs: string[]; lines: ReadingLine[] } {
  const b = L.reading;
  const k = L.width / 390;
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(b.x, b.y, b.w, b.h), 6 * k, 6 * k), paintOf(color.n0));
  canvas.drawRect(Skia.XYWHRect(b.x + 6 * k, b.y, b.w - 12 * k, 2), paintOf(color.n1));
  const spec = READING[L.height > L.width ? 'story' : 'square'];
  const x = b.x + 10 * k;
  const avail = b.w - 20 * k;
  const fit = (s: string, size: number) => {
    let px = size;
    while (px > 24 && width(s, fonts.vt323, px) > avail) px--;
    return px;
  };
  const rows: { size: number; runs: [string, string][] }[] = [
    { size: spec.sizes[0], runs: [[`${t.spi} `, color.p5], [t.tier, critical ? color.red : color.p5]] },
    { size: fit(t.line, spec.sizes[1]), runs: [[t.line, color.p5]] },
    ...(t.detail ? [{ size: fit(t.detail, spec.sizes[2]), runs: [[t.detail, color.p3]] as [string, string][] }] : []),
  ];
  const caps = rows.map((r) => CAP_EM.vt323 * r.size);
  const block = caps.reduce((a, c) => a + c, 0) + spec.gap * (rows.length - 1);
  let y = b.y + (b.h - block) / 2;
  const runs: string[] = [];
  const lines: ReadingLine[] = [];
  rows.forEach((row, i) => {
    y += caps[i]!;
    const baseline = Math.round(y);
    let cx = x;
    for (const [s, hex] of row.runs) {
      lines.push({ text: s, x: cx, fontSize: row.size, capTop: baseline - caps[i]!, baseline, color: hex });
      cx += text(canvas, s, cx, baseline, fonts.vt323, row.size, hex);
      runs.push(s);
    }
    y += spec.gap;
  });
  return { runs, lines };
}

/** Breaks `parts` (joined by ` · `) into the fewest lines no wider than `avail`, balanced. */
function breakRuns(parts: string[], fits: (s: string) => boolean): string[] {
  for (let n = 1; n <= parts.length; n++) {
    let best: string[] | null = null;
    let bestW = Infinity;
    const walk = (from: number, left: number, acc: string[]) => {
      if (left === 1) {
        const lines = [...acc, parts.slice(from).join(' · ')];
        const w = Math.max(...lines.map((l) => l.length));
        if (lines.every(fits) && w < bestW) {
          best = lines;
          bestW = w;
        }
        return;
      }
      for (let i = from + 1; i <= parts.length - left + 1; i++) walk(i, left - 1, [...acc, parts.slice(from, i).join(' · ')]);
    };
    walk(0, n, []);
    if (best) return best;
  }
  return parts;
}

/**
 * Footer: `[STORE NAME] · READINGS ARE SIMULATED` (localised), one run at the mark's size, centred;
 * where it does not fit (story) it breaks at the dot. `markWord` is the localised mark word in the
 * sentence (text.ts `footerMark`); its box is the one the cap-height and contrast test measures.
 */
function drawFooter(canvas: SkCanvas, L: CardLayout, fonts: CardFonts, footer: string, markWord: string): { mark: MarkBox; lines: string[]; x0: number; x1: number; bottom: number } {
  const size = markSize(L.height, CAP_EM.b612);
  const capPx = CAP_EM.b612 * size;
  const avail = L.width - 2 * 24;
  const lines = width(footer, fonts.b612, size) <= avail ? [footer] : footer.split(' · ');
  const pitch = Math.round(capPx * FOOTER_PITCH);
  let x0 = L.width;
  let x1 = 0;
  let mark: MarkBox | null = null;
  lines.forEach((line, i) => {
    const baseline = Math.round(L.footerTop + capPx + i * pitch);
    const w = width(line, fonts.b612, size);
    const x = Math.round((L.width - w) / 2);
    text(canvas, line, x, baseline, fonts.b612, size, color.n6);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x + w);
    if (i === lines.length - 1) {
      const at = line.lastIndexOf(markWord);
      if (at < 0) throw new Error(`share card: footer mark "${markWord}" not on the footer's last line`);
      const mx = x + width(line.slice(0, at), fonts.b612, size);
      mark = { kind: 'footer', x: mx, y: baseline - capPx, w: width(markWord, fonts.b612, size), h: capPx, baseline, fontSize: size, capPx };
    }
  });
  return { mark: mark!, lines, x0, x1, bottom: mark!.baseline };
}

export function drawShareCard(i: CardInput): CardRender {
  const L = LAYOUTS[i.format];
  const { record, fonts } = i;
  const t = cardText(record, i.store ?? STORE_NAME, i.locale);
  const P = L.photo;
  const panel = { w: P.w / CARD_HIRES, h: P.h / CARD_HIRES };
  const aspect = i.photo.height() / i.photo.width();
  const fig = figureLayout({ record, stats: i.stats, panel, aspect, beliefBand: i.beliefBand });
  const plain = plainTop(panel.h, panel.w, aspect);
  const top = fig ? fig.top : plain.top;
  const imgH = fig ? fig.imgH : plain.imgH;
  const k = CARD_HIRES;
  const grainSeed = fig ? fig.seed : record.seed >>> 0;

  // 1. The composite at the card's photo size, grain held back.
  const photoSurface = Skia.Surface.Make(P.w, P.h);
  if (!photoSurface) throw new Error('share card: no raster surface');
  const pc = photoSurface.getCanvas();
  const placement = fig ? fig.placement : null;
  const scaled = placement
    ? {
        ...placement,
        x: placement.x * k,
        y: placement.y * k,
        w: placement.w * k,
        h: placement.h * k,
        offsetCopies: placement.offsetCopies.map((c) => ({ ...c, dx: c.dx * k, dy: c.dy * k })),
        ...(placement.echo ? { echo: { ...placement.echo, dx: placement.echo.dx * k, dy: placement.echo.dy * k } } : {}),
      }
    : null;
  const setup = drawComposite(pc, {
    photo: i.photo,
    width: P.w,
    height: P.h,
    photoRect: { x: 0, y: top * k, width: P.w, height: imgH * k },
    region: fig?.region ?? null,
    meanLuma: fig?.meanLuma ?? i.stats?.meanLuma ?? 40,
    p80Luma: i.stats?.p80Luma,
    p90Luma: i.stats?.p90Luma,
    grid: i.stats?.grid,
    placement: scaled ?? { x: 0, y: 0, w: 1, h: 1, matte: 1, opacity: 0.08, flipX: false, offsetCopies: [] },
    tier: record.outcome.tier,
    seed: grainSeed,
    disabled: !scaled,
    grain: 0,
  });
  if (!setup) throw new Error('share card: ghost layer failed');
  const grain = setup.grain;

  // 2. The data strip, bottom-left of the photo, burned in before the grain: every run at the
  // mark's size; on two or more lines where it does not fit on one, SIMULATED last, left-aligned.
  const pad = Math.round(P.w * 0.02);
  const size = stripSize(L);
  const capPx = CAP_EM.vt323 * size;
  const sw = (s: string) => width(s, fonts.vt323, size);
  const oneLine = `${t.strip.data} · `;
  const oneFits = sw(oneLine) + sw(t.strip.mark) <= P.w - 3 * pad;
  const stripLines: string[][] = oneFits
    ? [[oneLine, t.strip.mark]]
    : [...breakRuns(t.strip.data.split(' · '), (l) => sw(l) <= P.w - 3 * pad).map((l) => [l]), [t.strip.mark]];
  const pitch = Math.round(capPx * STRIP_PITCH);
  const padY = Math.round(capPx * 0.35);
  const scrimBottom = P.h - pad;
  const lastBaseline = Math.round(scrimBottom - Math.max(padY, 0.2 * size));
  const baselines = stripLines.map((_, i) => lastBaseline - (stripLines.length - 1 - i) * pitch);
  const scrimTop = Math.floor(baselines[0]! - capPx - padY);
  const lineW = stripLines.map((runs) => runs.reduce((a, r) => a + sw(r), 0));
  const scrimW = Math.min(P.w, Math.ceil(Math.max(...lineW) + 2 * pad));
  // The strip sits bottom-left (brief), or bottom-right when the figure stands in the left half,
  // so the scrim never boxes the figure.
  const right = !!placement && placement.x + placement.w / 2 < panel.w / 2;
  const sx = right ? P.w - scrimW : 0;
  const under = photoSurface.makeImageSnapshot().readPixels(sx, scrimTop, { width: scrimW, height: scrimBottom - scrimTop, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  const maxRgb = [0, 0, 0];
  if (under) for (let p = 0; p < under.length; p += 4) for (let c = 0; c < 3; c++) maxRgb[c] = Math.max(maxRgb[c]!, under[p + c]!);
  else maxRgb.fill(255);
  const stripColor = rgb(color.p3);
  const alpha = scrimAlpha(maxRgb, stripColor, grain * 255);
  pc.drawRect(Skia.XYWHRect(sx, scrimTop, scrimW, scrimBottom - scrimTop), paintOf(color.n0, alpha));
  const drop = Math.max(1, Math.round(P.w / 366));
  let markX = sx + pad;
  stripLines.forEach((runs, i) => {
    let x = sx + pad;
    for (const run of runs) {
      if (run === t.strip.mark && i === stripLines.length - 1) markX = x;
      text(pc, run, x + drop, baselines[i]! + drop, fonts.vt323, size, color.n0);
      x += text(pc, run, x, baselines[i]!, fonts.vt323, size, color.p3);
    }
  });
  const markW = sw(t.strip.mark);
  const baseline = lastBaseline;
  const photoImage = photoSurface.makeImageSnapshot();

  // 3. The card.
  const surface = Skia.Surface.Make(L.width, L.height);
  if (!surface) throw new Error('share card: no raster surface');
  const canvas = surface.getCanvas();
  drawHousing(canvas, L, record.seed >>> 0);
  drawNameplate(canvas, L, fonts, t.nameplate, record.seed >>> 0);
  // The photo sits recessed: a 4 px n1 surround.
  canvas.drawRect(Skia.XYWHRect(P.x - 4, P.y - 4, P.w + 8, P.h + 8), paintOf(color.n1));
  // Grain after compositing, over the photo, the figure and the strip together (COMPOSITE_SKSL's step).
  canvas.save();
  canvas.clipRect(Skia.XYWHRect(P.x, P.y, P.w, P.h), ClipOp.Intersect, false);
  canvas.translate(P.x, P.y);
  const gfx = effect('grain', GRAIN_SKSL);
  const freq = GRAIN_FREQ / k;
  const gp = Skia.Paint();
  gp.setShader(
    gfx.makeShaderWithChildren(processUniforms(gfx, { grain }), [
      imageShader(photoImage, { x: 0, y: 0, width: P.w, height: P.h }, TileMode.Clamp),
      Skia.Shader.MakeFractalNoise(freq, freq, 2, grainSeed % 1000, 0, 0),
    ]),
  );
  canvas.drawRect(Skia.XYWHRect(0, 0, P.w, P.h), gp);
  canvas.restore();
  const reading = drawReading(canvas, L, fonts, t.reading, record.outcome.tier === 'critical');
  const footer = drawFooter(canvas, L, fonts, t.footer, t.footerMark);
  drawHousingDetail(canvas, L, { top: L.footerTop, bottom: footer.bottom, x0: footer.x0, x1: footer.x1 }, record.seed >>> 0);
  surface.flush();
  const image = surface.makeImageSnapshot();

  const stripMark: MarkBox = { kind: 'strip', x: P.x + markX, y: P.y + baseline - capPx, w: markW, h: capPx, baseline: P.y + baseline, fontSize: size, capPx };
  return {
    format: i.format,
    width: L.width,
    height: L.height,
    image,
    fileName: cardFileName(record.id),
    text: t,
    texts: [t.nameplate, ...stripLines.flat(), ...reading.runs, ...footer.lines],
    marks: [stripMark, footer.mark],
    strip: { x: P.x + sx, y: P.y + scrimTop, w: scrimW, h: scrimBottom - scrimTop, alpha },
    layout: L,
    readingLines: reading.lines,
    figure: fig,
  };
}

/** PNG bytes of a card image (re-encoded from pixels: no EXIF, no location). */
export function encodePng(image: SkImage): Uint8Array {
  const bytes = image.encodeToBytes(ImageFormat.PNG, 100);
  if (!bytes) throw new Error('share card: PNG encode failed');
  return bytes;
}
