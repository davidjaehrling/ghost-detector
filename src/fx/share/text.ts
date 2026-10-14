import type { Tier } from '../../engine';
import type { ScanRecord } from '../../state/scans';
import { evpLine } from '../../ui/result/deepCopy';
import { readingsFor } from '../../ui/result/readings';
import { stampText, thermalDelta } from '../../ui/result/stamp';
import { footerText, NAMEPLATE, SIMULATED, STORE_NAME } from './constants';

// Every string the share card draws, built from the scan record alone (pure). The renderer draws
// these and nothing else (it may break the strip and the footer into lines at ` · `); `cardTexts`
// lists them so a test can assert the set.

export const TIER_WORD: Record<Tier, string> = { quiet: 'QUIET', trace: 'TRACE', active: 'ACTIVE', strong: 'STRONG', critical: 'CRITICAL' };

export interface CardText {
  nameplate: string;
  /** Data strip: the case data (`CASE 0041 · SPI 84 · ΔT -6.3 °C · 23:41`) and the mark, one record. */
  strip: { data: string; mark: string };
  /**
   * Reading row: SPI digits and tier word; `line` is the EVP quote after a Deep Scan, else
   * `SIGNATURE [n]% DECODED` (`NO SIGNATURE` on QUIET); `detail` is class and era after a Deep Scan.
   */
  reading: { spi: string; tier: string; line: string; detail: string | null };
  /** `[STORE NAME] · READINGS ARE SIMULATED`, one run at one size. */
  footer: string;
}

export function isDeepScanned(record: Pick<ScanRecord, 'deepScanAt'>): boolean {
  return record.deepScanAt !== undefined && record.deepScanAt !== null;
}

export function cardText(record: ScanRecord, store: string = STORE_NAME): CardText {
  const { outcome, profile } = record;
  const tier = outcome.tier;
  const r = readingsFor(record.seed, tier);
  const stamp = stampText({ id: record.id, spi: outcome.spi, deltaC: thermalDelta(tier, r), createdAt: record.createdAt });
  const deep = isDeepScanned(record) && tier !== 'quiet';
  const era = profile.era.replace(/^Era /i, '').toUpperCase();
  const line = deep ? `EVP ${evpLine(record.seed)}` : tier === 'quiet' ? 'NO SIGNATURE' : `SIGNATURE ${profile.signatureDecodedPct}% DECODED`;
  return {
    nameplate: NAMEPLATE,
    strip: { data: stamp, mark: SIMULATED },
    reading: { spi: String(outcome.spi), tier: TIER_WORD[tier], line, detail: deep ? `CLASS: ${profile.class} · ERA ${era}` : null },
    footer: footerText(store),
  };
}

/** Every string on the card, in draw order, before line breaks. */
export function cardTexts(t: CardText): string[] {
  return [t.nameplate, t.strip.data, t.strip.mark, t.reading.spi, t.reading.tier, t.reading.line, ...(t.reading.detail ? [t.reading.detail] : []), t.footer];
}
