import type { Tier } from '../../engine';
import { copyOf, fmtFixed, getLocale, t, type Lang, type Params } from '../../i18n';
import { translate } from '../../i18n/core';
import type { ScanRecord } from '../../state/scans';
import { readingsFor } from '../../ui/result/readings';
import { clock, thermalDelta } from '../../ui/result/stamp';
import { NAMEPLATE, STORE_NAME } from './constants';

// Every string the share card draws, built from the scan record and the locale table (pure). The
// renderer draws these and nothing else (it may break the footer into lines at ` · ` or, where a
// part is still too wide, at its spaces); `cardTexts` lists them so a test can assert the set.
//
// Strings come from `share.card.*` in locales/<lang>.json, read in the active locale (or the
// `locale` override the probe and the tests pass). Tier words, the nameplate, codes and units stay
// English in every locale (docs/localisation-rules.md 2e).

export const TIER_WORD: Record<Tier, string> = { quiet: 'QUIET', trace: 'TRACE', active: 'ACTIVE', strong: 'STRONG', critical: 'CRITICAL' };

/** The card's keys. `mark` and `footer` are disclosures (D-038): no fallback to `en` in a shipped locale. */
export const CARD_KEYS = {
  mark: 'share.card.mark',
  footer: 'share.card.footer',
  decoded: 'share.card.decoded',
  none: 'share.card.none',
  evp: 'share.card.evp',
  detail: 'share.card.detail',
} as const;

/** The card's copy in the active locale (getters, so it follows a language change). */
export const cardCopy = copyOf(CARD_KEYS);

const EVP_LINE_COUNT = 12; // as src/ui/result/deepCopy.ts: locales keep exactly this many deep.evp.N keys

export interface CardText {
  /** The locale the strings were read in. */
  locale: Lang;
  nameplate: string;
  /**
   * Data strip, printed like a camera data back (A-90): `lines` are `23:41  2026-10-13` and
   * `CASE 0041  ΔT -6.3 °C`, the mark is the last line. SPI is in the reading row only. `data` is
   * the two lines joined (two spaces), for the tests and the accessible label.
   */
  strip: { lines: [string, string]; data: string; mark: string };
  /**
   * Reading row: SPI digits and tier word; `line` is the EVP quote after a Deep Scan, else
   * `SIGNATURE [n]% DECODED` (`NO SIGNATURE` on QUIET); `detail` is class and era after a Deep Scan.
   */
  reading: { spi: string; tier: string; line: string; detail: string | null };
  /** `[STORE NAME] · READINGS ARE SIMULATED`, one run at one size. */
  footer: string;
  /** The word in the footer the cap-height and contrast test measures (the footer's own mark word). */
  footerMark: string;
  /** The housing sticker's head line (A-92), `sticker.head1` without its trailing ` ·`: `SIMULATION UNIT`. */
  stickerHead: string;
}

/** Local calendar date of a timestamp, ISO (the data back prints `2026-10-13` in every locale). */
export function isoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isDeepScanned(record: Pick<ScanRecord, 'deepScanAt'>): boolean {
  return record.deepScanAt !== undefined && record.deepScanAt !== null;
}

/** A reader for one locale: t() in the active locale, or the table of an explicit override. */
function reader(locale?: Lang): { lang: Lang; tr: (key: string, params?: Params) => string } {
  if (!locale || locale === getLocale()) return { lang: getLocale(), tr: t };
  return { lang: locale, tr: (key, params) => translate(locale, key, params) };
}

/**
 * The footer word that carries the mark: the mark itself where the sentence contains it (EN, DE),
 * else the sentence's last word (ES `SIMULADAS`, PT `SIMULADAS` for the mark `SIMULADO`).
 */
export function footerMarkOf(footer: string, mark: string): string {
  if (footer.lastIndexOf(mark) >= 0) return mark;
  const words = footer.trim().split(/\s+/);
  return words[words.length - 1] ?? mark;
}

export function cardText(record: ScanRecord, store: string = STORE_NAME, locale?: Lang): CardText {
  const { lang, tr } = reader(locale);
  const { outcome, profile } = record;
  const tier = outcome.tier;
  const r = readingsFor(record.seed, tier);
  // Codes and units stay English in every locale (docs/localisation-rules.md 2e: `CASE`, `ΔT`, `°C`,
  // as `result.strip.data` writes them in all four tables); only the decimal mark is localised.
  const lines: [string, string] = [`${clock(record.createdAt)}  ${isoDate(record.createdAt)}`, `CASE ${record.id}  ΔT ${fmtFixed(thermalDelta(tier, r), 1, lang)} °C`];
  const data = lines.join('  ');
  const deep = isDeepScanned(record) && tier !== 'quiet';
  // The record's era carries its own label (`Era est. 1880 to 1934`), in the language of the scan;
  // the detail template prints the label itself, so the record's is dropped (this locale's or en's).
  const eraUp = profile.era.toUpperCase();
  const label = [tr('result.eraLabel'), translate('en', 'result.eraLabel')].map((l) => `${l.toUpperCase()} `).find((l) => eraUp.startsWith(l));
  const era = label ? eraUp.slice(label.length) : eraUp;
  const line = deep
    ? tr(CARD_KEYS.evp, { line: tr(`deep.evp.${(record.seed >>> 0) % EVP_LINE_COUNT}`) })
    : tier === 'quiet'
      ? tr(CARD_KEYS.none)
      : tr(CARD_KEYS.decoded, { pct: fmtFixed(profile.signatureDecodedPct, 0, lang) });
  const mark = tr(CARD_KEYS.mark);
  const footer = tr(CARD_KEYS.footer, { store });
  return {
    locale: lang,
    nameplate: NAMEPLATE,
    strip: { lines, data, mark },
    reading: { spi: String(outcome.spi), tier: TIER_WORD[tier], line, detail: deep ? tr(CARD_KEYS.detail, { cls: profile.class, era }) : null },
    footer,
    footerMark: footerMarkOf(footer, mark),
    stickerHead: tr('sticker.head1').replace(/\s*·\s*$/, ''),
  };
}

/** Every string on the card, in draw order, before line breaks. */
export function cardTexts(t: CardText): string[] {
  return [t.nameplate, ...t.strip.lines, t.strip.mark, t.reading.spi, t.reading.tier, t.reading.line, ...(t.reading.detail ? [t.reading.detail] : []), t.footer];
}
