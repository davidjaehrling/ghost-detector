import { describe, expect, it } from 'vitest';
import { type Backend } from '../backend';
import { ALLOWLIST, createAnalytics, sanitize } from '../index';

function rig(initial = false) {
  const calls: [string, ...unknown[]][] = [];
  let allowed = initial;
  const be: Backend = {
    setEnabled: (on) => void calls.push(['enable', on]),
    logEvent: (n, p) => void calls.push(['log', n, p]),
  };
  const a = createAnalytics(be, () => allowed);
  return { a, calls, allow: (v: boolean) => (allowed = v) };
}

describe('analytics gate', () => {
  it('sends nothing, not even enable, while not allowed', () => {
    const { a, calls } = rig(false);
    a.track('scan_complete', { tier: 'active', intensity: 'brave' });
    a.track('consent_status', { status: 'obtained' });
    a.track('share_card');
    expect(calls).toEqual([]);
  });
  it('enables once, then logs, when allowed', () => {
    const { a, calls } = rig(true);
    a.track('scan_complete', { tier: 'active', intensity: 'brave' });
    a.track('share_card');
    expect(calls).toEqual([['enable', true], ['log', 'scan_complete', { tier: 'active', intensity: 'brave' }], ['log', 'share_card', {}]]);
  });
  it('switches collection off when consent is withdrawn', () => {
    const { a, calls, allow } = rig(true);
    a.track('share_card');
    allow(false);
    a.track('share_card');
    expect(calls.at(-1)).toEqual(['enable', false]);
    expect(calls.filter((c) => c[0] === 'log')).toHaveLength(1);
  });
});

describe('analytics allowlist', () => {
  it('lists exactly the contract events', () => {
    expect(Object.keys(ALLOWLIST).sort()).toEqual(['consent_status', 'deep_scan_offered', 'deep_scan_rewarded', 'interstitial_shown', 'scan_complete', 'share_card']);
  });
  it('drops unknown events', () => {
    const { a, calls } = rig(true);
    a.track('purchase', { tier: 'active' });
    a.track('__proto__');
    a.track('toString');
    expect(calls).toEqual([]);
  });
  it('drops unknown keys and keeps the known ones', () => {
    expect(sanitize('scan_complete', { tier: 'strong', intensity: 'calm', note: 'hello', userId: 7 })).toEqual({ tier: 'strong', intensity: 'calm' });
    expect(sanitize('share_card', { tier: 'strong' })).toEqual({});
  });
  it('drops values outside the enum, free text and non-finite numbers', () => {
    expect(sanitize('scan_complete', { tier: 'grandma lives here', intensity: 'brave' })).toEqual({ intensity: 'brave' });
    expect(sanitize('scan_complete', { tier: 3, intensity: { a: 1 } })).toEqual({});
  });
  it('ignores inherited keys', () => {
    expect(sanitize('scan_complete', { constructor: 'x' })).toEqual({});
  });
});

describe('firebase.json', () => {
  it('has every automatic collection flag set to false', async () => {
    const { readFileSync } = await import('node:fs');
    const cfg = JSON.parse(readFileSync(new URL('../../../firebase.json', import.meta.url), 'utf8')) as { 'react-native': Record<string, unknown> };
    const flags = cfg['react-native'];
    for (const k of [
      'analytics_auto_collection_enabled',
      'analytics_default_allow_analytics_storage',
      'analytics_default_allow_ad_storage',
      'analytics_default_allow_ad_user_data',
      'analytics_default_allow_ad_personalization_signals',
      'google_analytics_adid_collection_enabled',
      'google_analytics_ssaid_collection_enabled',
      'google_analytics_automatic_screen_reporting_enabled',
    ]) expect(flags[k], k).toBe(false);
  });
});
