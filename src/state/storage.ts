// Platform storage behind every store. Web and tests: localStorage when it exists, else null
// (memory-only). Native swaps this file for storage.native.ts, so the web bundle never sees expo-sqlite.
import { fault } from './faults';
import type { KeyValueStore } from './scans';

// Web harness only: every write the fault wrapper refuses is recorded here, so a spec can assert the failure
// happened (not only that nothing was persisted).
export type StorageLogEntry = { op: 'set'; key: string; ok: boolean };
declare global {
  interface Window {
    __storageLog?: StorageLogEntry[];
  }
}
function logWrite(key: string, ok: boolean): void {
  if (typeof window !== 'undefined') (window.__storageLog ??= []).push({ op: 'set', key, ok });
}

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
        if (fault('storage-write')) {
          logWrite(k, false);
          throw new Error('storage write fault');
        }
        ls.setItem(k, v);
      },
    };
  } catch {
    return null;
  }
}
