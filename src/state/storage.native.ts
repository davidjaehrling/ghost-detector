// Native storage: the expo-sqlite kv-store behind the same getItem/setItem adapter.
// Required on first use, never at import; any failure falls back to memory-only (null).
import type { KeyValueStore } from './scans';

type SyncStore = { getItemSync(k: string): string | null; setItemSync(k: string, v: string): void };

let cached: KeyValueStore | null | undefined;

export function platformStorage(): KeyValueStore | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-sqlite/kv-store') as { default: SyncStore };
    const kv = mod.default;
    cached = {
      getItem: (k) => kv.getItemSync(k),
      setItem: (k, v) => kv.setItemSync(k, v),
    };
  } catch {
    cached = null;
  }
  return cached;
}
