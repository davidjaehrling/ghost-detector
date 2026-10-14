import { describe, expect, it } from 'vitest';
import { createConsentStore, EMPTY_CONSENT } from '../consent';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('consent store', () => {
  it('starts empty', () => expect(createConsentStore(mem()).get()).toEqual(EMPTY_CONSENT));
  it('round-trips through storage and notifies', () => {
    const st = mem();
    const a = createConsentStore(st);
    let n = 0;
    a.subscribe(() => n++);
    a.set({ status: 'obtained', canRequestAds: true, purpose1: true, privacyOptionsRequired: true });
    expect(n).toBe(1);
    expect(createConsentStore(st).get()).toMatchObject({ status: 'obtained', purpose1: true, privacyOptionsRequired: true });
  });
  it('ignores junk', () => {
    const st = mem();
    st.setItem('fs4.consent.v1', '{"status":"maybe"}');
    expect(createConsentStore(st).get()).toEqual(EMPTY_CONSENT);
    st.setItem('fs4.consent.v1', 'not json');
    expect(createConsentStore(st).get()).toEqual(EMPTY_CONSENT);
  });
});
