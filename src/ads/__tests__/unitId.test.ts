import Module from 'node:module';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LIVE_UNITS } from '../adUnits';

// backend.ts loads the SDK with a plain require(), which vi.mock does not see: stub Module._load.
const SDK = { TestIds: { REWARDED: 'test-rewarded', INTERSTITIAL: 'test-interstitial', ADAPTIVE_BANNER: 'test-banner' } };
const load = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
const realLoad = load._load;
beforeAll(() => {
  load._load = (request, ...rest) => (request === 'react-native-google-mobile-ads' ? SDK : realLoad.call(Module, request, ...rest));
});
afterAll(() => {
  load._load = realLoad;
});
afterEach(() => vi.unstubAllEnvs());

describe('unitId follows the release flag', () => {
  it('returns the SDK test IDs outside release mode', async () => {
    vi.stubEnv('EXPO_PUBLIC_RELEASE', '');
    const { backend } = await import('../backend');
    expect(backend.unitId('rewarded')).toBe('test-rewarded');
    expect(backend.unitId('interstitial')).toBe('test-interstitial');
    expect(backend.unitId('banner')).toBe('test-banner');
  });

  it('returns the live constants in release mode', async () => {
    vi.stubEnv('EXPO_PUBLIC_RELEASE', '1');
    const { backend } = await import('../backend');
    expect(backend.unitId('rewarded')).toBe(LIVE_UNITS.rewarded);
    expect(backend.unitId('interstitial')).toBe(LIVE_UNITS.interstitial);
    expect(backend.unitId('banner')).toBe(LIVE_UNITS.banner);
  });
});
