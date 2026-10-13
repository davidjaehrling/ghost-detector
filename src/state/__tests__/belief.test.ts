import { describe, expect, it } from 'vitest';
import { BELIEF_PROFILE, createBeliefStore } from '../belief';
import { createSeenTags, isLocationTag, LOCATION_TAGS } from '../locations';
import { createScanStore, type KeyValueStore } from '../scans';

const mem = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

describe('belief calibration', () => {
  it('is unanswered at first and remembers the answer', () => {
    const storage = mem();
    const a = createBeliefStore(storage);
    expect(a.getBelief()).toBeNull();
    a.setBelief('no', () => {});
    expect(a.getBelief()).toBe('no');
    expect(createBeliefStore(storage).getBelief()).toBe('no');
  });

  it('maps the answers to intensity and figure opacity per psych-brief 2.9', () => {
    expect(BELIEF_PROFILE.yes).toMatchObject({ intensity: 'standard', priming: 'full', opacityRange: [0.08, 0.14] });
    expect(BELIEF_PROFILE.unsure).toMatchObject({ intensity: 'standard', priming: 'medium', opacityRange: [0.11, 0.18] });
    expect(BELIEF_PROFILE.no).toMatchObject({ intensity: 'brave', priming: 'light', opacityRange: [0.14, 0.22], extraTelemetry: true });
  });

  it('applies the intensity through the scan store', () => {
    const scans = createScanStore({ storage: null });
    createBeliefStore(null).setBelief('no', scans.setIntensity);
    expect(scans.getIntensity()).toBe('brave');
  });

  it('ignores a corrupt stored value', () => {
    const storage = mem();
    storage.setItem('fs4.belief.v1', 'maybe');
    expect(createBeliefStore(storage).getBelief()).toBeNull();
  });
});

describe('location tags', () => {
  it('lists the five tags', () => {
    expect([...LOCATION_TAGS]).toEqual(['cellar', 'attic', 'bedroom', 'hallway', 'outdoors']);
    expect(isLocationTag('attic')).toBe(true);
    expect(isLocationTag('garden')).toBe(false);
  });

  it('remembers seen tags across stores and survives bad data', () => {
    const storage = mem();
    const a = createSeenTags(storage);
    expect(a.hasSeen('cellar')).toBe(false);
    a.markSeen('cellar');
    expect(createSeenTags(storage).hasSeen('cellar')).toBe(true);
    expect(createSeenTags(storage).hasSeen('attic')).toBe(false);
    storage.setItem('fs4.tags-seen.v1', '{not json');
    expect(createSeenTags(storage).hasSeen('cellar')).toBe(false);
  });
});

describe('recent lines', () => {
  it('returns the trait lines of recent profiles, newest last', () => {
    const s = createScanStore({ storage: null });
    const base = { photoUri: 'p', seed: 1, outcome: { tier: 'quiet', spi: 1, figureShown: false, smudge: false, jumpScare: false, scanDurationMs: 6000 } as const };
    s.saveScan({ ...base, createdAt: 1, profile: { class: 'A', era: 'e', name: 'N1', traits: ['one', 'two'], signatureDecodedPct: 5 } });
    s.saveScan({ ...base, createdAt: 2, profile: { class: 'A', era: 'e', name: 'N2', traits: ['three'], signatureDecodedPct: 5 } });
    expect(s.getRecentLines()).toEqual(['one', 'two', 'three']);
  });
});
