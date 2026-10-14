/** Web: the same PNG bytes as a data URL (nothing is written). */
export function saveCard(png: Uint8Array, _fileName: string): string {
  let bin = '';
  for (let i = 0; i < png.length; i += 0x8000) bin += String.fromCharCode(...png.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(bin)}`;
}
