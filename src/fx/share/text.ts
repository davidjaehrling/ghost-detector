import type { Tier } from '../../engine';
import type { ScanRecord } from '../../state/scans';
import { evpLine } from '../../ui/result/deepCopy';
import { readingsFor } from '../../ui/result/readings';
import { stampText, thermalDelta } from '../../ui/result/stamp';
import { footerLead, NAMEPLATE, SIMULATED, STORE_NAME } from './constants';

// Every string the share card draws, built from the scan record alone (pure). The renderer draws
// these and nothing else; `cardTexts` lists them so a test can assert the set.

export const TIER_WORD: Record<Tier, string> = { quiet: 'QUIET', trace: 'TRACE', active: 'ACTIVE', strong: 'STRONG', critical: 'CRITICAL' };

export interface CardText {
  nameplate: string;
  /** Data strip before the mark (`CASE 0041 · SPI 84 · ΔT -6.3 °C · 23:41 · `) and the mark. */
  strip: { lead: string; mark: string };
  /** Reading row: SPI digits, tier word, the second line, and the EVP line after a Deep Scan. */
  reading: { spi: string; tier: string; line2: string; evp: string | null };
  footer: { lead: string; mark: string };
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
  const line2 = deep ? `CLASS: ${profile.class} · ERA ${era}` : tier === 'quiet' ? 'NO SIGNATURE' : `SIGNATURE ${profile.signatureDecodedPct}% DECODED`;
  return {
    nameplate: NAMEPLATE,
    strip: { lead: `${stamp} · `, mark: SIMULATED },
    reading: { spi: String(outcome.spi), tier: TIER_WORD[tier], line2, evp: deep ? `EVP ${evpLine(record.seed)}` : null },
    footer: { lead: footerLead(store), mark: SIMULATED },
  };
}

/** Every string drawn on the card, in draw order. */
export function cardTexts(t: CardText): string[] {
  return [t.nameplate, t.strip.lead, t.strip.mark, t.reading.spi, t.reading.tier, t.reading.line2, ...(t.reading.evp ? [t.reading.evp] : []), t.footer.lead, t.footer.mark];
}
