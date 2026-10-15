// Scale bar labels and plate geometry (P3-05, A-48), pure so the tests can check them without Skia.
//
// The bar sits at the panel's right margin. Its labels are numbers only (the unit is printed once,
// above them) in a compact column on the bar's left, on an n0 plate no wider than the column, so the
// photo's right edge stays visible around it (QA golden review, P8).
import { barDeltas } from './encode';
import { formatDelta, type ThermalField } from './thermalField';

/** Bible section 3: scale bar 10 x 220 px. Shorter only when the panel cannot hold it. */
export const BAR_W = 10;
export const BAR_H = 220;
/** Bar's right edge to the panel's right edge. */
export const BAR_INSET = 8;
/** Ticks (4 px) and the cold-spot pointer (6 px) sit between the labels and the bar. */
export const POINTER = 6;
/** Label column's right edge to the bar: the pointer plus 2 px. */
export const LABEL_GAP = POINTER + 2;
/** Plate padding left of the widest label. */
export const PLATE_PAD = 2;
/** Unit row above the top label (one VT323 16 line). */
export const UNIT_ROW = 14;
/** Plate margin above the top label and below the bottom one. */
export const PLATE_MARGIN = 12;
/** The plate's width budget (QA golden review: about 36 px), met by labels up to 4 characters. */
export const PLATE_MAX_W = 36;

export interface ScaleLabels {
  hi: string;
  amb: string;
  lo: string;
  unit: string;
}

/** The bar's labels: ΔT against the room, numbers only, the same rounding as the spot readout. */
export function scaleLabels(field: ThermalField): ScaleLabels {
  const ends = barDeltas(field);
  const num = (c: number) => formatDelta(c).replace(/ °C$/, '');
  return { hi: num(ends.hi), amb: num(0), lo: num(ends.lo), unit: '°C' };
}

export interface ScaleGeometry {
  barX: number;
  barY: number;
  barH: number;
  /** Right edge of the label column (labels are right-aligned to it). */
  labelX: number;
  /** The n0 plate behind the unit, the labels, the ticks and the pointer; it ends at the bar. */
  plate: { x: number; y: number; w: number; h: number };
}

/** Bar and plate in panel px for a panel and the widest label's width (px). */
export function scaleGeometry(width: number, height: number, labelW: number): ScaleGeometry {
  // Room for the unit row and the plate margins inside the panel.
  const barH = Math.min(BAR_H, Math.max(60, height - 2 * (PLATE_MARGIN + 4) - UNIT_ROW - 16));
  const barX = width - BAR_INSET - BAR_W;
  const barY = Math.round((height - barH) / 2 + UNIT_ROW / 2);
  const labelX = barX - LABEL_GAP;
  const x = Math.floor(labelX - labelW - PLATE_PAD);
  const y = barY - PLATE_MARGIN - UNIT_ROW;
  return { barX, barY, barH, labelX, plate: { x, y, w: barX - x, h: barH + 2 * PLATE_MARGIN + UNIT_ROW } };
}
