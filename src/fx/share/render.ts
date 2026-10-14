import { AlphaType, ClipOp, ColorType, ImageFormat, processUniforms, Skia, TileMode, type SkCanvas, type SkImage, type SkRuntimeEffect, type SkTypeface } from '@shopify/react-native-skia';

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
import { cardText, cardTexts, type CardText } from './text';

// The share card, drawn offscreen on a CPU raster surface (same pixels on every run and backend
// family): housing, nameplate, the composite with the data strip burned under the grain, the
// reading row and the footer. Nothing else: no key, no QR code, no arrow or box near the figure.

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

export interface CardRender {
  format: CardFormat;
  width: number;
  height: number;
  image: SkImage;
  fileName: string;
  text: CardText;
  /** Every string drawn, in draw order. */
  texts: string[];
  marks: MarkBox[];
  /** The strip's scrim box in card pixels and the alpha chosen for it. */
  strip: Box & { alpha: number };
  layout: CardLayout;
  /** The figure as placed on the card (logical panel pixels), or null when the record shows none. */
  figure: FigureLayout | null;
}

/** Cap height per em, measured on the bundled TTFs (CanvasKit, glyph rows of `EHILT`). */
export const CAP_EM = { vt323: 0.56, b612: 0.76 } as const;
/** On-screen strip: VT323 16 px across a 366 px glass, scaled to the card's photo width. */
const STRIP_EM_PER_W = 16 / 366;
/** Footer lead in lbXS (10 px at 390), scaled to the card width. */
const FOOTER_EM_PER_W = 10 / 390;
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

function drawHousing(canvas: SkCanvas, L: CardLayout, seed: number) {
  const fx = effect('housing', HOUSING_SKSL);
  const base = rgb(color.n3).map((v) => v / 255);
  const noise = Skia.Shader.MakeFractalNoise(0.35, 0.35, 3, seed % 997, 0, 0);
  const p = Skia.Paint();
  p.setShader(fx.makeShaderWithChildren(processUniforms(fx, { size: [L.width, L.height], base, amp: HOUSING_NOISE, fall: HOUSING_FALL }), [noise]));
  canvas.drawRect(Skia.XYWHRect(0, 0, L.width, L.height), p);
  // Paint rubbed through to n4 on both long edges where thumbs grip (Bible section 2), seeded.
  const r = mulberry32((seed ^ 0x51ed) >>> 0);
  const k = L.width / 390;
  for (const x of [0, L.width - 3 * k]) {
    const h = (40 + r() * 30) * k;
    const y = L.height * (0.3 + r() * 0.4);
    canvas.drawRect(Skia.XYWHRect(x, y, 3 * k, h), paintOf(color.n4, 0.55));
  }
}

function drawNameplate(canvas: SkCanvas, L: CardLayout, fonts: CardFonts, label: string, seed: number) {
  const b = L.plate;
  const k = L.width / 390;
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(b.x, b.y, b.w, b.h), 2 * k, 2 * k), paintOf(color.n5));
  canvas.drawRect(Skia.XYWHRect(b.x, b.y, b.w, 2), paintOf(color.n6, 0.35));
  canvas.drawRect(Skia.XYWHRect(b.x, b.y + b.h - 2, b.w, 2), paintOf(color.n4));
  const cy = b.y + b.h / 2;
  for (const cx of [b.x + 8 * k, b.x + b.w - 8 * k]) {
    canvas.drawCircle(cx, cy, 2 * k, paintOf(color.n4));
    canvas.drawCircle(cx - 1, cy - 1, 0.8 * k, paintOf(color.n6, 0.6));
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

function drawReading(canvas: SkCanvas, L: CardLayout, fonts: CardFonts, t: CardText['reading'], critical: boolean) {
  const b = L.reading;
  const k = L.width / 390;
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(b.x, b.y, b.w, b.h), 6 * k, 6 * k), paintOf(color.n0));
  canvas.drawRect(Skia.XYWHRect(b.x + 6 * k, b.y, b.w - 12 * k, 2), paintOf(color.n1));
  const evp = t.evp !== null;
  const story = L.height > L.width;
  // [line1 size, line1 baseline, line2 size, line2 baseline, line3 baseline] from the row top.
  const m = story ? (evp ? [56, 50, 30, 78, 103] : [60, 58, 36, 96, 0]) : evp ? [72, 62, 34, 98, 130] : [76, 70, 40, 120, 0];
  const x = b.x + 10 * k;
  const w = text(canvas, `${t.spi} `, x, b.y + m[1]!, fonts.vt323, m[0]!, critical ? color.p5 : color.p4);
  text(canvas, t.tier, x + w, b.y + m[1]!, fonts.vt323, m[0]!, critical ? color.red : color.p4);
  text(canvas, t.line2, x, b.y + m[3]!, fonts.vt323, m[2]!, color.p3);
  if (t.evp) text(canvas, t.evp, x, b.y + m[4]!, fonts.vt323, m[2]!, color.p4);
}

function drawFooter(canvas: SkCanvas, L: CardLayout, fonts: CardFonts, t: CardText['footer']): MarkBox {
  const mark = markSize(L.height, CAP_EM.b612);
  const pad = 24;
  let lead = Math.round(FOOTER_EM_PER_W * L.width);
  const fits = () => width(t.lead, fonts.b612, lead) + width(t.mark, fonts.b612, Math.max(lead, mark)) <= L.width - 2 * pad;
  while (lead > 12 && !fits()) lead--;
  const markPx = Math.max(lead, mark);
  const capPx = CAP_EM.b612 * markPx;
  const baseline = Math.round(L.footerTop + capPx);
  const total = width(t.lead, fonts.b612, lead) + width(t.mark, fonts.b612, markPx);
  const x0 = Math.round((L.width - total) / 2);
  const lw = text(canvas, t.lead, x0, baseline, fonts.b612, lead, color.n6);
  const mw = text(canvas, t.mark, x0 + lw, baseline, fonts.b612, markPx, color.n6);
  return { kind: 'footer', x: x0 + lw, y: baseline - capPx, w: mw, h: capPx, baseline, fontSize: markPx, capPx };
}

export function drawShareCard(i: CardInput): CardRender {
  const L = LAYOUTS[i.format];
  const { record, fonts } = i;
  const t = cardText(record, i.store ?? STORE_NAME);
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

  // 2. The data strip, bottom-left of the photo, burned in before the grain.
  const pad = Math.round(P.w * 0.02);
  const markPx0 = markSize(L.height, CAP_EM.vt323);
  let dataPx = Math.round(STRIP_EM_PER_W * P.w);
  const stripFits = () => width(t.strip.lead, fonts.vt323, dataPx) + width(t.strip.mark, fonts.vt323, Math.max(dataPx, markPx0)) <= P.w - 3 * pad;
  while (dataPx > 16 && !stripFits()) dataPx--;
  const markPx = Math.max(dataPx, markPx0);
  const capPx = CAP_EM.vt323 * markPx;
  const padY = Math.round(capPx * 0.35);
  const scrimBottom = P.h - pad;
  const baseline = Math.round(scrimBottom - Math.max(padY, 0.2 * dataPx));
  const scrimTop = Math.floor(baseline - capPx - padY);
  const leadW = width(t.strip.lead, fonts.vt323, dataPx);
  const markW = width(t.strip.mark, fonts.vt323, markPx);
  const scrimW = Math.min(P.w, Math.ceil(leadW + markW + 2 * pad));
  const under = photoSurface.makeImageSnapshot().readPixels(0, scrimTop, { width: scrimW, height: scrimBottom - scrimTop, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  const maxRgb = [0, 0, 0];
  if (under) for (let p = 0; p < under.length; p += 4) for (let c = 0; c < 3; c++) maxRgb[c] = Math.max(maxRgb[c]!, under[p + c]!);
  else maxRgb.fill(255);
  const stripColor = rgb(color.p3);
  const alpha = scrimAlpha(maxRgb, stripColor, grain * 255);
  pc.drawRect(Skia.XYWHRect(0, scrimTop, scrimW, scrimBottom - scrimTop), paintOf(color.n0, alpha));
  const drop = Math.max(1, Math.round(P.w / 366));
  text(pc, t.strip.lead, pad + drop, baseline + drop, fonts.vt323, dataPx, color.n0);
  text(pc, t.strip.mark, pad + leadW + drop, baseline + drop, fonts.vt323, markPx, color.n0);
  text(pc, t.strip.lead, pad, baseline, fonts.vt323, dataPx, color.p3);
  text(pc, t.strip.mark, pad + leadW, baseline, fonts.vt323, markPx, color.p3);
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
  drawReading(canvas, L, fonts, t.reading, record.outcome.tier === 'critical');
  const footer = drawFooter(canvas, L, fonts, t.footer);
  surface.flush();
  const image = surface.makeImageSnapshot();

  const stripMark: MarkBox = { kind: 'strip', x: P.x + pad + leadW, y: P.y + baseline - capPx, w: markW, h: capPx, baseline: P.y + baseline, fontSize: markPx, capPx };
  return {
    format: i.format,
    width: L.width,
    height: L.height,
    image,
    fileName: cardFileName(record.id),
    text: t,
    texts: cardTexts(t),
    marks: [stripMark, footer],
    strip: { x: P.x, y: P.y + scrimTop, w: scrimW, h: scrimBottom - scrimTop, alpha },
    layout: L,
    figure: fig,
  };
}

/** PNG bytes of a card image (re-encoded from pixels: no EXIF, no location). */
export function encodePng(image: SkImage): Uint8Array {
  const bytes = image.encodeToBytes(ImageFormat.PNG, 100);
  if (!bytes) throw new Error('share card: PNG encode failed');
  return bytes;
}
