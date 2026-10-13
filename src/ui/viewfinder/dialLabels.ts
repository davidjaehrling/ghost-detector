import { fluxAngle } from './flux';

// Scale-label placement for the EMF dial. Every label box sits outside the tick ring
// (its nearest point is at least RING_GAP beyond the outer tick radius) and, at the
// right end, inset from the plate edge.

export const DIAL_W = 150;
export const DIAL_H = 96;
export const DIAL_R = 60;
export const PIVOT = { x: DIAL_W / 2, y: 88 };
export const LABEL_CH = 6.9; // VT323 16 px advance plus tracking
export const LABEL_H = 16;
export const RING_GAP = 8;
export const PLATE_INSET = 6;

export type LabelBox = { mg: number; text: string; left: number; top: number; width: number; height: number };

export function labelBox(mg: number): LabelBox {
  const text = String(mg);
  const width = Math.round(text.length * LABEL_CH);
  const a = (fluxAngle(mg) * Math.PI) / 180;
  const half = Math.abs(Math.sin(a)) * (width / 2) + Math.abs(Math.cos(a)) * (LABEL_H / 2);
  const r = DIAL_R + RING_GAP + half;
  const cx = PIVOT.x + r * Math.sin(a);
  const cy = PIVOT.y - r * Math.cos(a);
  let left = Math.round(cx - width / 2);
  // Inset from the plate edges; the tick ring stays clear because the box only moves inward.
  left = Math.max(PLATE_INSET, Math.min(DIAL_W - PLATE_INSET - width, left));
  return { mg, text, left, top: Math.round(cy - LABEL_H / 2), width, height: LABEL_H };
}

export const LABELLED = [10, 100, 1000, 2000] as const;
export const labelBoxes = () => LABELLED.map(labelBox);

// Distance from the pivot to the nearest point of the box.
export function nearestToPivot(b: LabelBox): number {
  const dx = Math.max(b.left - PIVOT.x, 0, PIVOT.x - (b.left + b.width));
  const dy = Math.max(b.top - PIVOT.y, 0, PIVOT.y - (b.top + b.height));
  return Math.hypot(dx, dy);
}

// GEO label: left of the needle path, below the arc chord of the Earth band and near the pivot.
export const GEO_LABEL = { left: PIVOT.x - 40, top: PIVOT.y - 26, width: 28 };
