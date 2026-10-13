import { mulberry32 } from '../../engine';

// Bible §6 glass layer: one static overlay per install seed. 40 to 60 dust specks (1 to 3 px,
// 2 to 5% alpha) and 2 to 4 hairline scratches (30 to 120 px, 4% alpha), drawn in n4.
// Positions are fractions of the overlay (0..1) so the same install looks the same at any size.

export type Speck = { x: number; y: number; r: number; alpha: number };
export type Scratch = { x0: number; y0: number; cx: number; cy: number; len: number; angle: number; bow: number; alpha: number };
export type DustField = { specks: Speck[]; scratches: Scratch[] };

export const SCRATCH_ALPHA = 0.04;

export function dustField(seed: number): DustField {
  const rnd = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const nSpecks = 40 + Math.floor(rnd() * 21);
  const specks: Speck[] = [];
  for (let i = 0; i < nSpecks; i++) {
    // Diameter 1 to 3 px, skewed toward the small end.
    const d = 1 + 2 * rnd() ** 2;
    specks.push({ x: rnd(), y: rnd(), r: d / 2, alpha: 0.02 + 0.03 * rnd() });
  }
  const nScratches = 2 + Math.floor(rnd() * 3);
  const scratches: Scratch[] = [];
  for (let i = 0; i < nScratches; i++) {
    const len = 30 + 90 * rnd();
    // Mostly shallow diagonals, the way a wiped lens collects them.
    const angle = (rnd() - 0.5) * Math.PI * 0.7 + (rnd() < 0.5 ? 0 : Math.PI);
    scratches.push({ x0: 0.08 + 0.84 * rnd(), y0: 0.08 + 0.84 * rnd(), cx: 0, cy: 0, len, angle, bow: (rnd() - 0.5) * 0.25, alpha: SCRATCH_ALPHA });
  }
  return { specks, scratches };
}
