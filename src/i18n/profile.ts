// The entity profile is written in the language of the scan and stored that way: a record made in
// German keeps its German class, era and traits if the language is changed later. Same seed, same
// picks in every language (the banks are index-aligned); only the strings and the decimal mark differ.
import { generateProfileWith, type EntityProfile, type RecentProfiles, type Tier } from '../engine';
import { LANGS, tableFor, translate, type Lang } from './core';
import { fmtFixed } from './format';
import { getLocale } from './index';

export function profileFor(seed: number, tier: Tier, recent: RecentProfiles, lang: Lang = getLocale()): EntityProfile {
  return generateProfileWith(seed, tier, recent, tableFor(lang, 'engine.'), (n, digits) => (digits === undefined ? String(n) : fmtFixed(n, digits, lang)));
}

/**
 * The record's era without its leading label (`Época est. 1880 a 1934` is `EST. 1880 A 1934`), whatever
 * language the record was scanned in: the label of any language is dropped, the row prints its own.
 */
export function eraValue(era: string): string {
  const up = era.toUpperCase();
  const label = LANGS.map((l) => `${translate(l, 'result.eraLabel').toUpperCase()} `).find((l) => up.startsWith(l));
  return label ? up.slice(label.length) : up;
}
