/**
 * Field to bytes for the raster pass. Pure TS, tested. Each sensor pixel becomes one opaque grey
 * RGBA texel holding its position on the display scale, 0 at the field minimum, 1 at the maximum.
 *
 * The scale is what FLIR cameras call histogram (plateau) equalisation, at full strength: the
 * pixel's rank in the field. A deep cold spot would otherwise squeeze the
 * whole room into the top two palette stops. The scale bar places its ticks with the same
 * `displayPos`, so the labels stay true to the picture.
 */
import { mulberry32 } from '../../engine';
import type { ThermalField } from './thermalField';

/** Sensor shimmer in the live (non-static) view, °C peak. */
export const SHIMMER_C = 0.12;

/**
 * Share of the display scale (the palette's p0 to p1) kept for the cold body under the room's own
 * coldest pixel (A-46). Full equalisation gave the dark room the same p0 as the column, so the
 * column vanished into it at the crosshair; now the room starts at p1 and the column alone goes darker.
 */
export const COLD_BAND = 0.2;

/**
 * Display range of a field, never narrower than 1 °C. `lo` is the bar's bottom (A-48): the cold
 * spot's ΔT where it is colder than the room (so `SP1 ΔT` is the coldest value the bar shows),
 * else the room's coldest pixel; anything colder clamps to it. `room` is the room's coldest pixel
 * without the dip, where the cold band ends.
 */
export function displayRange(field: ThermalField): { lo: number; hi: number; room: number } {
  const spot = field.coldSpotC === null ? Infinity : field.ambientC + field.coldSpotC;
  const roomMin = field.roomMinC ?? field.minC;
  const lo = field.coldSpotC === null ? field.minC : Math.min(roomMin, spot);
  const hi = Math.max(field.maxC, lo + 1);
  return { lo, hi, room: Math.min(hi, Math.max(lo, roomMin)) };
}

/** The scale bar's ends as ΔT against the room's ambient, °C, 0.1 °C (bottom first). */
export function barDeltas(field: ThermalField): { lo: number; hi: number } {
  const { lo, hi } = displayRange(field);
  const r = (v: number) => Math.round(v * 10) / 10;
  return { lo: field.coldSpotC !== null && lo === field.ambientC + field.coldSpotC ? field.coldSpotC : r(lo - field.ambientC), hi: r(hi - field.ambientC) };
}

/** True when the field has a cold body under the room (the scale keeps COLD_BAND for it). */
function hasBand(lo: number, room: number): boolean {
  return room - lo > 0.5;
}

/** Normalised position of a temperature on the display range, 0..1. */
export function rangePos(c: number, lo: number, hi: number): number {
  return Math.min(1, Math.max(0, (c - lo) / (hi - lo)));
}

/**
 * Weight of the rank term in `displayPos` (0 = linear, 1 = full equalisation). Full strength since
 * round 2 (D-017): half strength left the room soft and low in contrast.
 */
export const EQUALISE = 1;

/** Bins of the cumulative histogram behind `rankOf`. */
const CDF_BINS = 1024;
const cdfCache = new WeakMap<ThermalField, Float32Array>();

/** Cumulative share of pixels below each bin edge over the display range, built once per field. */
function cdfOf(field: ThermalField): Float32Array {
  let cdf = cdfCache.get(field);
  if (cdf) return cdf;
  const { lo: lo0, hi, room } = displayRange(field);
  const lo = hasBand(lo0, room) ? room : lo0;
  const hist = new Uint32Array(CDF_BINS);
  let n = 0;
  for (let i = 0; i < field.data.length; i++) {
    const c = field.data[i]!;
    if (c < lo && lo > lo0) continue; // the cold body below the room is on the cold band
    hist[Math.min(CDF_BINS - 1, Math.floor(rangePos(c, lo, hi) * CDF_BINS))]!++;
    n++;
  }
  n = Math.max(1, n);
  cdf = new Float32Array(CDF_BINS + 1);
  let acc = 0;
  for (let b = 0; b < CDF_BINS; b++) {
    cdf[b] = acc / n;
    acc += hist[b]!;
  }
  cdf[CDF_BINS] = 1;
  cdfCache.set(field, cdf);
  return cdf;
}

/** Share of the field's pixels colder than `c`, 0..1, interpolated in a 1024-bin histogram. */
export function rankOf(field: ThermalField, c: number): number {
  const { lo: lo0, hi, room } = displayRange(field);
  const lo = hasBand(lo0, room) ? room : lo0;
  const cdf = cdfOf(field);
  const p = rangePos(c, lo, hi) * CDF_BINS;
  const b = Math.min(CDF_BINS - 1, Math.floor(p));
  return cdf[b]! + (cdf[b + 1]! - cdf[b]!) * (p - b);
}

/** Display-scale position of a temperature, 0..1, monotonic in `c`. */
export function displayPos(field: ThermalField, c: number): number {
  const { lo, hi, room } = displayRange(field);
  if (!hasBand(lo, room)) return (1 - EQUALISE) * rangePos(c, lo, hi) + EQUALISE * rankOf(field, c);
  if (c <= room) return COLD_BAND * rangePos(c, lo, room);
  return COLD_BAND + (1 - COLD_BAND) * ((1 - EQUALISE) * rangePos(c, room, hi) + EQUALISE * rankOf(field, c));
}

/**
 * RGBA bytes of the field. `frame` > 0 adds seeded per-pixel shimmer (the live view); frame 0 is
 * the static picture.
 */
export function encodeField(field: ThermalField, frame = 0): Uint8Array {
  const n = field.width * field.height;
  const out = new Uint8Array(n * 4);
  const rnd = frame > 0 ? mulberry32((frame * 0x85ebca6b) >>> 0) : null;
  for (let i = 0; i < n; i++) {
    const c = field.data[i]! + (rnd ? (rnd() * 2 - 1) * SHIMMER_C : 0);
    const v = Math.round(displayPos(field, c) * 255);
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}
