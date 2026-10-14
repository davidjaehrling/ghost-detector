import { describe, expect, it } from 'vitest';
import enJson from '../../../locales/engine/en.json';
import deJson from '../../../locales/engine/de.json';
import esJson from '../../../locales/engine/es.json';
import ptJson from '../../../locales/engine/pt.json';
import claimWords from '../../../scripts/claim-words.json';
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
