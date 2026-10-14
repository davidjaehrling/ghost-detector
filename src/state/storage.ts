// Platform storage behind every store. Web and tests: localStorage when it exists, else null
// (memory-only). Native swaps this file for storage.native.ts, so the web bundle never sees expo-sqlite.
import type { KeyValueStore } from './scans';

export function platformStorage(): KeyValueStore | null {
  try {
    const ls = (globalThis as { localStorage?: KeyValueStore }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}
