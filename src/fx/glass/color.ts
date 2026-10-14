import { color } from '../../ui/tokens';

// '#RRGGBB' -> [r, g, b] in 0..1, the form SkSL float3 uniforms take.
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Phosphor steps p0..p5 (Bible §4), index = step.
export const PHOSPHOR = [color.p0, color.p1, color.p2, color.p3, color.p4, color.p5] as const;
export type PhosphorStep = 0 | 1 | 2 | 3 | 4 | 5;

// '#RRGGBB' + alpha -> 'rgba(...)' (parsed the same by Skia on both backends).
export function withAlpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex).map((v) => Math.round(v * 255));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
