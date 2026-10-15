import { describe, expect, it } from 'vitest';
import enJson from '../../../locales/engine/en.json';
import deJson from '../../../locales/engine/de.json';
import esJson from '../../../locales/engine/es.json';
import ptJson from '../../../locales/engine/pt.json';
import claimWords from '../../../scripts/claim-words.json';
import { nextNotificationWith, type NotifyState } from '../notify';
import { EN_LISTS, checkStrings, extraKeys, missingKeys, placeholderMismatches, type EngineStrings } from '../strings';

const en: EngineStrings = enJson;
const PREFIX = { en: 'FIELD LOG', de: 'FELDPROTOKOLL', es: 'REGISTRO DE CAMPO', pt: 'REGISTO DE CAMPO' } as const;
const TABLES = { de: deJson, es: esJson, pt: ptJson } as const satisfies Record<string, EngineStrings>;

const titleKeys = (t: EngineStrings) => Object.keys(t).filter((k) => /^notify\.t\d\.title$/.test(k));

describe('locales/engine/en.json against the English lists', () => {
  it('passes EN_LISTS', () => {
    expect(checkStrings(en, EN_LISTS)).toEqual([]);
  });
  it('passes the shared claim-words.json lists', () => {
    const w = claimWords.en;
    expect(checkStrings(en, { banned: EN_LISTS.banned, claim: w.claim, claimNotify: EN_LISTS.claimNotify, framing: w.framing, exempt: claimWords.exempt })).toEqual([]);
  });
  it('has the capitals prefix and every title starts with {prefix}', () => {
    expect(en['notify.prefix']).toBe(PREFIX.en);
    const keys = titleKeys(en);
    expect(keys.length).toBe(5);
    for (const k of keys) expect(en[k]!.startsWith('{prefix}'), k).toBe(true);
  });
});

describe.each(['de', 'es', 'pt'] as const)('locales/engine/%s.json', (lang) => {
  const table: EngineStrings = TABLES[lang];
  it('has exactly the en keys', () => {
    expect(missingKeys(en, table)).toEqual([]);
    expect(extraKeys(en, table)).toEqual([]);
  });
  it('keeps every placeholder', () => {
    expect(placeholderMismatches(en, table)).toEqual([]);
  });
  it('passes the claim-word and framing checks and has no em-dash', () => {
    const w = claimWords[lang];
    expect(checkStrings(table, { banned: [], claim: w.claim, claimNotify: [], framing: w.framing, exempt: claimWords.exempt })).toEqual([]);
  });
  it('uses the capitals notification prefix and every title starts with {prefix}', () => {
    expect(table['notify.prefix']).toBe(PREFIX[lang]);
    const keys = titleKeys(table);
    expect(keys.length).toBe(titleKeys(en).length);
    for (const k of keys) expect(table[k]!.startsWith('{prefix}'), k).toBe(true);
  });
});

describe('notify.t4.body tag casing', () => {
  const DAY = 86_400_000;
  const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
  const st = (k: number, tag: string): NotifyState => ({
    intensity: 'standard', belief: 'unsure', jumpScaresOff: false, sessionCount: 3, optedIn: true,
    installMs: T0 - 5 * DAY, lastAppOpenMs: T0 + k * DAY - 3_600_000, nowMs: T0 + k * DAY, utcOffsetMin: 0,
    scans: [{ caseId: 41, atMs: T0 + k * DAY - DAY, tier: 'active', spi: 55, decodedPct: 63, decoded: false, declined: false, newClass: false, tags: [tag] }],
    loggedTags: [], catalogueCount: 7, sent: [],
  });
  const body = (table: EngineStrings, tag: string): string => {
    for (let k = 0; k < 400; k++) for (let seed = 1; seed < 5; seed++) {
      const n = nextNotificationWith(st(k, tag), seed, table);
      if (n?.templateId === 4) return n.body;
    }
    throw new Error('template 4 never fired');
  };
  it('German capitalises the tag noun, umlaut included', () => {
    expect(body(deJson, 'keller')).toMatch(/^Protokolliert \d\d:\d\d, Keller\. /);
    expect(body(deJson, 'äußerer Flur')).toMatch(/^Protokolliert \d\d:\d\d, Äußerer flur\. /);
  });
  it('English, Spanish and Portuguese keep the tag as logged mid-sentence', () => {
    for (const t of [en, esJson, ptJson]) expect(body(t, 'keller')).toMatch(/\d\d:\d\d, keller\. /);
  });
});
