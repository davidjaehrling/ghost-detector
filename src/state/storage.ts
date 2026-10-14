// Platform storage behind every store. Web and tests: localStorage when it exists, else null
// (memory-only). Native swaps this file for storage.native.ts, so the web bundle never sees expo-sqlite.
import { fault } from './faults';
import type { KeyValueStore } from './scans';

export function platformStorage(): KeyValueStore | null {
  try {
    const ls = (globalThis as { localStorage?: KeyValueStore }).localStorage;
    if (!ls) return null;
    if (!fault('storage-read') && !fault('storage-write')) return ls;
    // Harness faults (web only): the store throws the way a full or blocked localStorage does.
    return {
      getItem(k) {
        if (fault('storage-read')) throw new Error('storage read fault');
        return ls.getItem(k);
      },
      setItem(k, v) {
        if (fault('storage-write')) throw new Error('storage write fault');
        ls.setItem(k, v);
      },
    };
  } catch {
    return null;
  }
}
