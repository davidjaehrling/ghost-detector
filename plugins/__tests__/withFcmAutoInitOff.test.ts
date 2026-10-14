import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { setFcmAutoInitOff, META_NAME } = require('../withFcmAutoInitOff.js');

const minimal = (metaData?: unknown[]) => ({
  manifest: {
    application: [
      { $: { 'android:name': '.MainApplication' }, ...(metaData ? { 'meta-data': metaData } : {}) },
    ],
  },
});

const entries = (m: any) =>
  (m.manifest.application[0]['meta-data'] ?? []).filter((x: any) => x.$['android:name'] === META_NAME);

describe('withFcmAutoInitOff', () => {
  it('adds firebase_messaging_auto_init_enabled=false', () => {
    const out = setFcmAutoInitOff(minimal());
    expect(entries(out)).toEqual([{ $: { 'android:name': META_NAME, 'android:value': 'false' } }]);
  });

  it('is idempotent', () => {
    const out = setFcmAutoInitOff(setFcmAutoInitOff(minimal()));
    expect(entries(out)).toHaveLength(1);
  });

  it('forces an existing true entry to false and keeps other entries', () => {
    const other = { $: { 'android:name': 'x', 'android:value': '1' } };
    const out = setFcmAutoInitOff(
      minimal([other, { $: { 'android:name': META_NAME, 'android:value': 'true' } }]),
    );
    expect(entries(out)).toHaveLength(1);
    expect(entries(out)[0].$['android:value']).toBe('false');
    expect(out.manifest.application[0]['meta-data']).toContain(other);
  });
});
