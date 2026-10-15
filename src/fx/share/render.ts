import { AlphaType, ClipOp, ColorType, ImageFormat, processUniforms, Skia, TileMode, type SkCanvas, type SkImage, type SkRuntimeEffect, type SkTypeface } from '@shopify/react-native-skia';

import type { Lang } from '../../i18n';
import type { ScanRecord } from '../../state/scans';
import { color } from '../../ui/tokens';
import { mulberry32 } from '../../engine';
import { Bin } from '../bin';
import { drawComposite, imageShader } from '../compositor/offscreen';
import type { Band } from '../compositor/blend';
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
// record. A-90: the strip prints like a camera data back, three left-aligned lines on one baseline
// grid (time and date, case and ΔT, SIMULATED last), at the mark's floor size.
//
// A-08 (D-045 ruling 2): the photo takes the viewfinder's phosphor tint inside the composite; the
// scrim goes on the tinted photo, then the grain, and only then the strip text and the mark, so the
// mark and the footer are never tinted or grained and print at 100%.

export interface CardFonts {
  /** VT323 (readouts: strip, reading row). */
  vt323: SkTypeface;
  /** B612 Mono Regular (footer) and Bold (nameplate, the Bible's lbM). */
  b612: SkTypeface;
  b612Bold: SkTypeface;
}

/** The install identity the card prints: serial on the nameplate, CAL and PRÜF on the sticker. */
export interface CardIdentity {
  serial: string;
  cal: string;
  pruef: string;
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
  /** The install's serial (nameplate) and calibration stamp (housing sticker, A-92); default the harness unit's (`CARD_IDENTITY`). */
  identity?: CardIdentity;
  /** Test switches: `tint: false` draws the photo's own colour, `ghost: false` the photo without the figure (same layout). */
  fx?: { tint?: boolean; ghost?: boolean };
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
  /** The LED plate (A-93): LEDs lit (the tier's count), whether LED 5 is red, each lens in card pixels (LED 1 first, at the bottom). */
  leds: { lit: number; red: boolean; lenses: { cx: number; cy: number; r: number }[] };
  /** Auto-gain applied to the photo, dB (A-45; 0 unless near-black). */
  gainDb: number;
  /** Phosphor tint mix used on the photo (0 with `fx.tint` false). */
  tintMix: number;
  tintLift: number;
  /** The housing sticker (A-92): its axis-aligned bounds after the -1.5° turn, lines and font size; null where it does not fit. */
  sticker: (Box & { lines: string[]; fontSize: number }) | null;
  /** Footer line boxes as drawn (cap top to baseline), card pixels. */
  footerBoxes: Box[];
  /** The bottom band's engraving (A-92, story only): bounds, lines and font size; null where it does not fit. */
  engraving: (Box & { lines: string[]; fontSize: number }) | null;
  /** The compositor's foreground mass (A-98 hem test) in photo-window pixels (add layout.photo's x and y for card pixels), or null. */
  band: Band | null;
}

/** Cap height per em, measured on the bundled TTFs (CanvasKit, glyph rows of `EHILT`). */
export const CAP_EM = { vt323: 0.56, b612: 0.76 } as const;
/** Baseline pitch of the strip's and the footer's lines, as a multiple of the cap height. */
const STRIP_PITCH = 1.5;
const FOOTER_PITCH = 1.45;
/** Reading row: [SPI and tier, line, detail] font sizes and the gap between cap boxes (D-034 b). */
const READING = {
  story: { sizes: [96, 62, 42], gap: 24 },
  square: { sizes: [96, 62, 36], gap: 16 },
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

/** One size for every strip run: the mark's floor size (A-90; story 76 px, square 43 px). */
export function stripSize(L: CardLayout): number {
  return markSize(L.height, CAP_EM.vt323);
}

/** LEDs lit per tier (Bible section 3: LED 1 is power, always on). */
export const TIER_LEDS: Record<ScanRecord['outcome']['tier'], number> = { quiet: 1, trace: 2, active: 3, strong: 4, critical: 5 };

/** Every Skia object one card allocates (paints, fonts, shaders, images), freed when `drawShareCard` returns. */
const bin = new Bin();

function paintOf(hex: string, alpha = 1) {
  const p = bin.own(Skia.Paint());
  p.setAntiAlias(true);
  p.setColor(Skia.Color(hex));
  if (alpha < 1) p.setAlphaf(alpha);
  return p;
}

function text(canvas: SkCanvas, s: string, x: number, y: number, face: SkTypeface, size: number, hex: string, alpha = 1): number {
  const font = bin.own(Skia.Font(face, size));
  canvas.drawText(s, x, y, paintOf(hex, alpha), font);
  return font.getTextWidth(s);
}

const width = (s: string, face: SkTypeface, size: number) => bin.own(Skia.Font(face, size)).getTextWidth(s);

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
  const noise = bin.own(Skia.Shader.MakeFractalNoise(0.35, 0.35, 3, seed % 997, 0, 0));
  const p = bin.own(Skia.Paint());
  p.setShader(bin.own(fx.makeShaderWithChildren(processUniforms(fx, { size: [L.width, L.height], base, amp: HOUSING_NOISE, fall: HOUSING_FALL }), [noise])));
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

/** The harness unit's identity (Bible section 11, `identityFromSeed` at the fixed seed), the card's default. */
export const CARD_IDENTITY: Readonly<CardIdentity> = { serial: 'FS4-8711-00417-9', cal: '2026-10-13', pruef: '07' };
/** Sticker turn (Bible section 2) and its paper padding as shares of the cap height. */
const STICKER_DEG = -1.5;
const STICKER_PAD = { x: 0.45, y: 0.4 } as const;
const STICKER_PITCH = 1.4;
/** Bottom-band engraving (A-92, story): two lines of B612 Mono Bold n2 at lbXS scaled (10 px at 390), right-aligned in footer line 1's band. */
export const ENGRAVING = { lines: ['FIELD SPECTROMETER', 'MADE IN W.-GERMANY'], size: 28, pitch: 1.35 } as const;

/** Paper size of a sticker for its lines at `size` (B612 Mono Bold head, Regular below). */
function stickerSize(lines: string[], fonts: CardFonts, size: number): { w: number; h: number } {
  const cap = CAP_EM.b612 * size;
  const tw = Math.max(...lines.map((l, i) => width(l, i === 0 ? fonts.b612Bold : fonts.b612, size)));
  return { w: Math.ceil(tw + 2 * STICKER_PAD.x * cap), h: Math.ceil(cap * (1 + STICKER_PITCH * (lines.length - 1)) + 2 * STICKER_PAD.y * cap) };
}

/** Axis-aligned bounds of a w x h box turned STICKER_DEG about its centre (cx, cy). */
function turnedBounds(cx: number, cy: number, w: number, h: number): Box {
  const a = (Math.abs(STICKER_DEG) * Math.PI) / 180;
  const bw = w * Math.cos(a) + h * Math.sin(a);
  const bh = w * Math.sin(a) + h * Math.cos(a);
  return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
}

/**
 * Calibration sticker (A-92): paper with ink print, the head line in B612 Mono Bold and the CAL and
 * PRÜF lines in Regular, all at the card's floor size; turned -1.5° about its centre, the
 * bottom-right corner lifted over a shadow.
 */
function drawSticker(canvas: SkCanvas, cx: number, cy: number, lines: string[], fonts: CardFonts, size: number) {
  const { w, h } = stickerSize(lines, fonts, size);
  const cap = CAP_EM.b612 * size;
  canvas.save();
  canvas.translate(cx, cy);
  canvas.rotate(STICKER_DEG, 0, 0);
  canvas.translate(-w / 2, -h / 2);
  canvas.drawRect(Skia.XYWHRect(2, 3, w, h), paintOf(color.n1, 0.55));
  const c = Math.min(h * 0.3, 18);
  canvas.drawRect(Skia.XYWHRect(w - c, h - c + 2, c + 3, c + 3), paintOf(color.n1, 0.5));
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paintOf(color.paper));
  lines.forEach((l, i) => {
    const base = STICKER_PAD.y * cap + cap + i * STICKER_PITCH * cap;
    text(canvas, l, STICKER_PAD.x * cap, Math.round(base), i === 0 ? fonts.b612Bold : fonts.b612, size, color.ink);
  });
  // The lifted corner: a folded triangle, lit, clipped to the sticker's corner.
  canvas.save();
  canvas.clipRect(Skia.XYWHRect(w - c, h - c, c, c), ClipOp.Intersect, true);
  canvas.drawRect(Skia.XYWHRect(w - c, h - c, c, c), paintOf(color.n3));
  canvas.translate(w, h);
  canvas.rotate(45, 0, 0);
  canvas.drawRect(Skia.XYWHRect(-c, -c * 0.71, 2 * c, c), paintOf(color.n6, 0.85));
  canvas.restore();
  canvas.restore();
}

const overlaps = (a: Box, b: Box, gap = 0) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

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

/** Footer line boxes as drawn (cap top to baseline), for the sticker and engraving placement. */
interface FooterGeom {
  top: number;
  bottom: number;
  x0: number;
  x1: number;
  boxes: Box[];
  mark: Box;
}

/**
 * Fasteners, sticker, engraving and wear in the housing's dead bands (Bible section 2), outside the
 * safe zone. A-92: the story's sticker sits in the top band between the screws; on the square it
 * takes the free space right of the footer only where it fits clear of the footer run and the mark
 * (head and CAL line, else the head alone, else none). The engraving is story-only.
 */
function drawHousingDetail(canvas: SkCanvas, L: CardLayout, footer: FooterGeom, seed: number, fonts: CardFonts, sticker: string[], avoid: Box[]): Pick<CardRender, 'sticker' | 'engraving'> {
  const r = mulberry32((seed ^ 0x5c3e) >>> 0);
  const story = L.height > L.width;
  const burred = Math.floor(r() * 4);
  const angle = () => 15 + r() * 150;
  const fy = (footer.top + footer.bottom) / 2;
  const size = markSize(L.height, CAP_EM.b612);
  let placed: CardRender['sticker'] = null;
  let engraving: CardRender['engraving'] = null;
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
    const { w, h } = stickerSize(sticker, fonts, size);
    const cx = L.width / 2 + 40;
    const cy = top / 2;
    const b = turnedBounds(cx, cy, w, h);
    if (b.x > 56 + 15 + 8 && b.x + b.w < L.width - 56 - 15 - 8 && b.y > 4 && b.y + b.h < top - 6) {
      drawSticker(canvas, cx, cy, sticker, fonts, size);
      placed = { ...b, lines: sticker, fontSize: size };
    }
    engraving = drawEngraving(canvas, L, footer, fonts);
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
    // Free space right of the footer: clear of its run and the mark by 16 px, of the right screw, the reading box and the card edge.
    const x0 = footer.x1 + 16;
    const x1 = L.width - 24 - 12 - 8;
    const y0 = L.reading.y + L.reading.h + 4;
    const y1 = L.height - 6;
    for (const lines of [sticker, sticker.slice(0, 1)]) {
      const { w, h } = stickerSize(lines, fonts, size);
      const b = turnedBounds((x0 + x1) / 2, (y0 + y1) / 2, w, h);
      if (b.x >= x0 && b.x + b.w <= x1 && b.y >= y0 && b.y + b.h <= y1 && ![...footer.boxes, footer.mark, ...avoid].some((o) => overlaps(b, o, 8))) {
        drawSticker(canvas, (x0 + x1) / 2, (y0 + y1) / 2, lines, fonts, size);
        placed = { ...b, lines, fontSize: size };
        break;
      }
    }
  }
  return { sticker: placed, engraving };
}

/**
 * The story's engraving (A-92): `FIELD SPECTROMETER` / `MADE IN W.-GERMANY` in n2 over a faint lit
 * lip (as the nameplate), right-aligned at the footer's right limit, its last baseline on the
 * footer's first baseline; drawn only where it clears every footer line by 12 px and the reading box.
 */
function drawEngraving(canvas: SkCanvas, L: CardLayout, footer: FooterGeom, fonts: CardFonts): CardRender['engraving'] {
  const first = footer.boxes[0];
  if (!first || footer.boxes.length < 2) return null;
  const size = ENGRAVING.size;
  const cap = CAP_EM.b612 * size;
  const pitch = Math.round(cap * ENGRAVING.pitch);
  const lines = [...ENGRAVING.lines];
  const w = Math.max(...lines.map((l) => width(l, fonts.b612Bold, size)));
  const base1 = first.y + first.h;
  const box: Box = { x: L.footerRight - w, y: base1 - pitch - cap, w, h: pitch + cap };
  if (box.y < L.reading.y + L.reading.h + 6) return null;
  if (footer.boxes.some((b) => overlaps(box, b, 12))) return null;
  lines.forEach((l, i) => {
    const y = base1 - (lines.length - 1 - i) * pitch;
    const x = L.footerRight - width(l, fonts.b612Bold, size);
    text(canvas, l, x, y + 1.5, fonts.b612Bold, size, color.n6, 0.3);
    text(canvas, l, x, y, fonts.b612Bold, size, color.n2);
  });
  return { ...box, lines, fontSize: size };
}

/** Nameplate: maker left, the install's full serial right (the screen's Nameplate, src/ui/screens/Nameplate.tsx). Returns the runs drawn. */
function drawNameplate(canvas: SkCanvas, L: CardLayout, fonts: CardFonts, label: string, serial: string, seed: number): string[] {
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
  // Engraved: the n2 text over a faint lit lower lip. lbM (13 px at 390), B612 Mono Bold.
  const size = Math.round(13 * k * 0.85);
  const base = cy + (CAP_EM.b612 * size) / 2;
  const x = b.x + 18 * k;
  const sx = b.x + b.w - 18 * k - width(serial, fonts.b612Bold, size);
  // A 6 px scuff (Bible section 2), seeded, in the maker text's span under its baseline, never on a letter.
  const r = mulberry32((seed ^ 0x5c0f) >>> 0);
  canvas.drawRect(Skia.XYWHRect(x + width(label, fonts.b612Bold, size) * (0.2 + r() * 0.6), base + 3 * k, 6 * k, 1.2 * k), paintOf(color.n4, 0.7));
  for (const [run, rx] of [[label, x], [serial, sx]] as const) {
    text(canvas, run, rx, base + 1.5, fonts.b612Bold, size, color.n6, 0.45);
    text(canvas, run, rx, base, fonts.b612Bold, size, color.n2);
  }
  return [label, serial];
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

/** Greedy word wrap of one run into lines no wider than `avail` (a single word wider than that keeps its own line). */
function wrapWords(run: string, fits: (s: string) => boolean): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of run.split(' ')) {
    const next = line ? `${line} ${w}` : w;
    if (!line || fits(next)) line = next;
    else {
      out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out;
}

/**
 * Footer lines (A-91): the whole sentence as one run where it fits, else broken at its ` · `, and
 * any part still too wide at its spaces. Never truncated: every character of `footer` is drawn.
 */
export function footerLines(footer: string, fits: (s: string) => boolean): string[] {
  if (fits(footer)) return [footer];
  return footer.split(' · ').flatMap((part) => (fits(part) ? [part] : wrapWords(part, fits)));
}

/**
 * Footer: `[STORE NAME] · READINGS ARE SIMULATED` (localised) at the mark's floor size, left-aligned
 * at `footerX` (A-91), on two or more lines only where it does not fit. Drawn last over the housing,
 * untinted. `markWord` is the localised mark word in the sentence (text.ts `footerMark`); its box is
 * the one the cap-height and contrast test measures.
 */
function drawFooter(canvas: SkCanvas, L: CardLayout, fonts: CardFonts, footer: string, markWord: string): { mark: MarkBox; lines: string[]; x0: number; x1: number; bottom: number; boxes: Box[] } {
  const size = markSize(L.height, CAP_EM.b612);
  const capPx = CAP_EM.b612 * size;
  const avail = L.footerRight - L.footerX;
  const lines = footerLines(footer, (l) => width(l, fonts.b612, size) <= avail);
  const pitch = Math.round(capPx * FOOTER_PITCH);
  const x = L.footerX;
  let x1 = 0;
  let mark: MarkBox | null = null;
  const boxes: Box[] = [];
  lines.forEach((line, i) => {
    const baseline = Math.round(L.footerTop + capPx + i * pitch);
    const w = width(line, fonts.b612, size);
    boxes.push({ x, y: baseline - capPx, w, h: capPx });
    text(canvas, line, x, baseline, fonts.b612, size, color.n6);
    x1 = Math.max(x1, x + w);
    if (i === lines.length - 1) {
      const at = line.lastIndexOf(markWord);
      if (at < 0) throw new Error(`share card: footer mark "${markWord}" not on the footer's last line`);
      const mx = x + width(line.slice(0, at), fonts.b612, size);
      mark = { kind: 'footer', x: mx, y: baseline - capPx, w: width(markWord, fonts.b612, size), h: capPx, baseline, fontSize: size, capPx };
    }
  });
  return { mark: mark!, lines, x0: x, x1, bottom: mark!.baseline, boxes };
}

/**
 * The K-II style LED plate (Bible section 3, A-93) beside the reading window: five round lenses,
 * bottom to top, on a plate with two screws. Lit to the tier's count in p3, p4, p4, p5; LED 5 red,
 * on CRITICAL only. Unlit: n2 lens with an n4 specular dot at 10 o'clock. Lit: a bloom at 35%.
 */
function drawLeds(canvas: SkCanvas, L: CardLayout, tier: ScanRecord['outcome']['tier']): CardRender['leds'] {
  const b = L.leds;
  const k = L.width / 390;
  canvas.drawRect(Skia.XYWHRect(b.x + 2, b.y + 3, b.w, b.h), paintOf(color.n1, 0.6));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(b.x, b.y, b.w, b.h), 2 * k, 2 * k), paintOf(color.n2));
  canvas.drawRect(Skia.XYWHRect(b.x, b.y, b.w, 2), paintOf(color.n4, 0.8));
  const screwR = Math.round(b.w * 0.13);
  const pad = screwR * 2 + 10;
  const d = Math.min(b.w * 0.5, (b.h - 2 * pad) / 4.6);
  const pitch = (b.h - 2 * pad - d) / 4;
  const cx = b.x + b.w / 2;
  for (const cy of [b.y + pad / 2, b.y + b.h - pad / 2]) drawScrew(canvas, cx, cy, screwR, 35 + (cy % 50), false);
  const lit = TIER_LEDS[tier];
  const red = tier === 'critical';
  const steps = [color.p3, color.p4, color.p4, color.p5, color.red];
  const lenses: CardRender['leds']['lenses'] = [];
  for (let i = 0; i < 5; i++) {
    const cy = b.y + b.h - pad - d / 2 - i * pitch;
    const r = d / 2;
    lenses.push({ cx, cy, r });
    canvas.drawCircle(cx, cy, r + 2, paintOf(color.n1));
    if (i < lit) {
      const hex = steps[i]!;
      const bloom = bin.own(Skia.Paint());
      bloom.setAntiAlias(true);
      const [cr, cg, cb] = rgb(hex);
      bloom.setShader(bin.own(Skia.Shader.MakeRadialGradient({ x: cx, y: cy }, r + 6 * k, [Skia.Color(`rgba(${cr}, ${cg}, ${cb}, 0.35)`), Skia.Color(`rgba(${cr}, ${cg}, ${cb}, 0)`)], [r / (r + 6 * k), 1], TileMode.Clamp)));
      canvas.drawCircle(cx, cy, r + 6 * k, bloom);
      canvas.drawCircle(cx, cy, r, paintOf(hex));
      canvas.drawCircle(cx - r * 0.35, cy - r * 0.35, Math.max(1.5, r * 0.18), paintOf(color.p5, 0.55));
    } else {
      canvas.drawCircle(cx, cy, r, paintOf(color.n2));
      canvas.drawCircle(cx - r * 0.45, cy - r * 0.3, Math.max(1.5, r * 0.12), paintOf(color.n4));
    }
  }
  return { lit, red, lenses };
}

export function drawShareCard(i: CardInput): CardRender {
  try {
    return drawCard(i);
  } finally {
    bin.free();
  }
}

function drawCard(i: CardInput): CardRender {
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

  // 1. The composite at the card's photo size, tinted (A-08), grain held back.
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
    disabled: !scaled || i.fx?.ghost === false,
    grain: 0,
    tint: i.fx?.tint,
  });
  if (!setup) throw new Error('share card: ghost layer failed');
  const grain = setup.grain;

  // 2. The data strip's scrim, bottom-left of the photo, on the tinted composite (before the grain):
  // three data-back lines at the mark's floor size, SIMULATED last, left-aligned (A-90).
  const pad = Math.round(P.w * 0.02);
  const size = stripSize(L);
  const capPx = CAP_EM.vt323 * size;
  const sw = (s: string) => width(s, fonts.vt323, size);
  const stripLines = [t.strip.lines[0], t.strip.lines[1], t.strip.mark];
  const pitch = Math.round(capPx * STRIP_PITCH);
  const padY = Math.round(capPx * 0.35);
  const scrimBottom = P.h - pad;
  const lastBaseline = Math.round(scrimBottom - Math.max(padY, 0.2 * size));
  const baselines = stripLines.map((_, n) => lastBaseline - (stripLines.length - 1 - n) * pitch);
  const scrimTop = Math.floor(baselines[0]! - capPx - padY);
  const scrimW = Math.min(P.w, Math.ceil(Math.max(...stripLines.map(sw)) + 2 * pad));
  // The strip sits bottom-left (brief), or bottom-right when the figure stands in the left half,
  // so the scrim never boxes the figure.
  const right = !!placement && placement.x + placement.w / 2 < panel.w / 2;
  const sx = right ? P.w - scrimW : 0;
  const before = photoSurface.makeImageSnapshot();
  const under = before.readPixels(sx, scrimTop, { width: scrimW, height: scrimBottom - scrimTop, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  before.dispose();
  const maxRgb = [0, 0, 0];
  if (under) for (let p = 0; p < under.length; p += 4) for (let c = 0; c < 3; c++) maxRgb[c] = Math.max(maxRgb[c]!, under[p + c]!);
  else maxRgb.fill(255);
  const stripColor = rgb(color.p3);
  const alpha = scrimAlpha(maxRgb, stripColor, grain * 255);
  pc.drawRect(Skia.XYWHRect(sx, scrimTop, scrimW, scrimBottom - scrimTop), paintOf(color.n0, alpha));
  const photoImage = photoSurface.makeImageSnapshot();
  photoSurface.dispose();

  // 3. The card.
  const surface = Skia.Surface.Make(L.width, L.height);
  if (!surface) throw new Error('share card: no raster surface');
  const canvas = surface.getCanvas();
  drawHousing(canvas, L, record.seed >>> 0);
  const id = i.identity ?? CARD_IDENTITY;
  const plateRuns = drawNameplate(canvas, L, fonts, t.nameplate, id.serial, record.seed >>> 0);
  // The photo sits recessed: a 4 px n1 surround.
  canvas.drawRect(Skia.XYWHRect(P.x - 4, P.y - 4, P.w + 8, P.h + 8), paintOf(color.n1));
  // Grain after compositing, over the tinted photo, the figure and the scrim together (COMPOSITE_SKSL's step).
  canvas.save();
  canvas.clipRect(Skia.XYWHRect(P.x, P.y, P.w, P.h), ClipOp.Intersect, false);
  canvas.translate(P.x, P.y);
  const gfx = effect('grain', GRAIN_SKSL);
  const freq = GRAIN_FREQ / k;
  const gp = bin.own(Skia.Paint());
  gp.setShader(
    bin.own(
      gfx.makeShaderWithChildren(processUniforms(gfx, { grain }), [
        bin.own(imageShader(photoImage, { x: 0, y: 0, width: P.w, height: P.h }, TileMode.Clamp)),
        bin.own(Skia.Shader.MakeFractalNoise(freq, freq, 2, grainSeed % 1000, 0, 0)),
      ]),
    ),
  );
  canvas.drawRect(Skia.XYWHRect(0, 0, P.w, P.h), gp);
  // 4. The strip text after tint, scrim and grain: p3 at 100% over a 1 px n0 copy, never tinted.
  const drop = Math.max(1, Math.round(P.w / 366));
  const markX = sx + pad;
  stripLines.forEach((run, n) => {
    text(canvas, run, sx + pad + drop, baselines[n]! + drop, fonts.vt323, size, color.n0);
    text(canvas, run, sx + pad, baselines[n]!, fonts.vt323, size, color.p3);
  });
  canvas.restore();
  const markW = sw(t.strip.mark);
  const baseline = lastBaseline;
  const reading = drawReading(canvas, L, fonts, t.reading, record.outcome.tier === 'critical');
  const leds = drawLeds(canvas, L, record.outcome.tier);
  const footer = drawFooter(canvas, L, fonts, t.footer, t.footerMark);
  const stickerLines = L.height > L.width ? [t.stickerHead, `CAL ${id.cal}`, `PRÜF ${id.pruef}`] : [t.stickerHead, `CAL ${id.cal} · PRÜF ${id.pruef}`];
  const avoid: Box[] = [L.leds, L.reading, { x: P.x, y: P.y, w: P.w, h: P.h }];
  const housing = drawHousingDetail(canvas, L, { top: L.footerTop, bottom: footer.bottom, x0: footer.x0, x1: footer.x1, boxes: footer.boxes, mark: footer.mark }, record.seed >>> 0, fonts, stickerLines, avoid);
  surface.flush();
  const image = surface.makeImageSnapshot();
  // Free the wasm heap now (CanvasKit has no GC for these): the card image keeps its own pixels.
  // The paints, fonts and shaders go with the bin when drawShareCard returns.
  surface.dispose();
  photoImage.dispose();

  const stripMark: MarkBox = { kind: 'strip', x: P.x + markX, y: P.y + baseline - capPx, w: markW, h: capPx, baseline: P.y + baseline, fontSize: size, capPx };
  return {
    format: i.format,
    width: L.width,
    height: L.height,
    image,
    fileName: cardFileName(record.id),
    text: t,
    texts: [...plateRuns, ...stripLines, ...reading.runs, ...footer.lines],
    marks: [stripMark, footer.mark],
    strip: { x: P.x + sx, y: P.y + scrimTop, w: scrimW, h: scrimBottom - scrimTop, alpha },
    layout: L,
    readingLines: reading.lines,
    figure: fig,
    leds,
    gainDb: setup.gain.db,
    tintMix: i.fx?.tint === false ? 0 : setup.tintMix,
    tintLift: setup.tintLift,
    band: setup.ref.band ?? null,
    sticker: housing.sticker,
    footerBoxes: footer.boxes,
    engraving: housing.engraving,
  };
}

/** PNG bytes of a card image (re-encoded from pixels: no EXIF, no location). */
export function encodePng(image: SkImage): Uint8Array {
  const bytes = image.encodeToBytes(ImageFormat.PNG, 100);
  if (!bytes) throw new Error('share card: PNG encode failed');
  return bytes;
}
