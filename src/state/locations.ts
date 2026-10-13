import { type KeyValueStore, webStorage } from './scans';

// Location tags for the viewfinder (docs/psych-brief.md section 2.1). The tag
// primes the scan with a two-line field-manual note, shown on the first scan
// of each tag; the seen set is stored on the device.

export const LOCATION_TAGS = ['cellar', 'attic', 'bedroom', 'hallway', 'outdoors'] as const;
export type LocationTag = (typeof LOCATION_TAGS)[number];

export function isLocationTag(v: unknown): v is LocationTag {
  return typeof v === 'string' && (LOCATION_TAGS as readonly string[]).includes(v);
}

const KEY = 'fs4.tags-seen.v1';

export function createSeenTags(storage: KeyValueStore | null = webStorage()) {
  let seen: Set<LocationTag> | null = null;
  const load = () => {
    if (seen) return seen;
    seen = new Set();
    try {
      const raw: unknown = JSON.parse(storage?.getItem(KEY) ?? '[]');
      if (Array.isArray(raw)) for (const t of raw) if (isLocationTag(t)) seen.add(t);
    } catch {
      // memory only
    }
    return seen;
  };
  return {
    hasSeen: (tag: LocationTag) => load().has(tag),
    markSeen(tag: LocationTag) {
      load().add(tag);
      try {
        storage?.setItem(KEY, JSON.stringify([...load()]));
      } catch {
        // memory only
      }
    },
  };
}

const store = createSeenTags();
export const hasSeenTag = store.hasSeen;
export const markTagSeen = store.markSeen;
