import { seedFrom } from '../engine';

// Cheap photo hash: FNV-1a (32 bit) over `${uri}|${width}x${height}`, as 8 hex
// digits. It does not read pixels; the URI of a fresh capture is already
// unique, and the size separates fixtures that share a path. seedFrom() then
// mixes in the capture time, so the same photo scanned twice gives two seeds.
export function photoHash(uri: string, width: number, height: number): string {
  const s = `${uri}|${width}x${height}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function captureSeed(uri: string, width: number, height: number, nowMs: number): number {
  return seedFrom(photoHash(uri, width, height), nowMs);
}
