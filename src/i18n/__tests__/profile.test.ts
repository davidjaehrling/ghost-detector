import { describe, expect, it } from 'vitest';
import { generateProfile } from '../../engine';
import { demoRecord } from '../../ui/result/demo';
import { tableFor } from '../core';
import { eraValue, profileFor } from '../profile';

const classes = (lang: 'en' | 'de' | 'es' | 'pt') =>
  Object.entries(tableFor(lang, 'engine.')).filter(([k]) => k.startsWith('profile.class.')).map(([, v]) => v);

describe('profileFor', () => {
  it('en is byte-identical to the legacy generator', () => {
    for (const tier of ['quiet', 'active', 'strong', 'critical'] as const) {
      for (let seed = 1; seed <= 40; seed++) {
        const recent = { names: [], lines: [] };
        expect(profileFor(seed, tier, recent, 'en')).toEqual(generateProfile(seed, tier, recent));
      }
    }
  });
  it('same seed picks the same class index in every language', () => {
    const idx = (lang: 'en' | 'de' | 'es' | 'pt') => classes(lang).indexOf(profileFor(7, 'active', { names: [], lines: [] }, lang).class);
    expect(idx('de')).toBeGreaterThanOrEqual(0);
    expect(idx('de')).toBe(idx('en'));
    expect(idx('es')).toBe(idx('en'));
    expect(idx('pt')).toBe(idx('en'));
  });
});

describe('demo record in de', () => {
  it('has a German class name and a German era', () => {
    const rec = demoRecord('active', 'x', '0007', null, undefined, 'de');
    expect(classes('de')).toContain(rec.profile.class);
    expect(classes('en')).not.toContain(rec.profile.class);
    expect(rec.profile.era).toMatch(/^Ära ca\. \d+ bis \d+$/);
    expect(demoRecord('active', 'x', '0007', null, undefined, 'en').profile.era).toMatch(/^Era est\. /);
  });
  it('de detail lines use the decimal comma', () => {
    const dts = Array.from({ length: 200 }, (_, i) => profileFor(i + 1, 'strong', { names: [], lines: [] }, 'de').traits.join('|')).join('|');
    expect(dts).toMatch(/Drift -\d,\d/);
    expect(dts).not.toMatch(/Drift -\d\.\d/);
  });
});

describe('eraValue', () => {
  it('drops the label of whichever language the record was scanned in', () => {
    expect(eraValue('Era est. 1880 to 1934')).toBe('EST. 1880 TO 1934');
    expect(eraValue('Ära ca. 1880 bis 1934')).toBe('CA. 1880 BIS 1934');
    expect(eraValue('Época aprox. 1880 a 1934')).toBe('APROX. 1880 A 1934');
    expect(eraValue('Época est. 1880 a 1934')).toBe('EST. 1880 A 1934');
  });
});
