import type { Tier } from '../../engine';
import { fmtFixed, getLocale, t } from '../../i18n';
import type { Readings } from './readings';

// The data strip burned into the photo's lower left corner (share crop): case, SPI, ΔT and the
// time of capture, one VT323 line. ΔT is the reading the thermal view and the COLD SPOT line carry:
// pinned to the cold spot on STRONG and CRITICAL, the THERM reading below that.

export const PINNED_TIERS: readonly Tier[] = ['strong', 'critical'];

export function thermalDelta(tier: Tier, r: Pick<Readings, 'thermalC' | 'coldSpotC'>): number {
  return PINNED_TIERS.includes(tier) ? r.coldSpotC : r.thermalC;
}

export function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function stampText({ id, spi, deltaC, createdAt }: { id: string; spi: number; deltaC: number; createdAt: number }): string {
  return t('result.strip.data', { id, spi, dt: fmtFixed(deltaC, 1, getLocale()), time: clock(createdAt) });
}

/**
 * The strip as the result screen draws it (A-40, A-41, D-045 ruling 7): two lines, case and time
 * on the first, the labelled ΔT and the mark on the second, so `SIMULATED` is always last and a
 * plain screenshot carries it (D-034). The share card prints its own run (src/fx/share/text.ts), so
 * `stampText` stays the card's data run. ΔT is named for what it is: the cold-spot minimum on the
 * pinned tiers, the ambient average (the ΔT AVG row) below them.
 */
export function screenStampLines(d: Parameters<typeof stampText>[0], tier: Tier): [string, string] {
  const dt = fmtFixed(d.deltaC, 1, getLocale());
  const key = PINNED_TIERS.includes(tier) ? 'result.strip.min' : 'result.strip.avg';
  return [t('result.strip.a', { id: d.id, spi: d.spi, time: clock(d.createdAt) }), `${t(key, { dt })}  ${t('result.strip.mark')}`];
}

/** The auto-gain reading on the data strip (A-45): an instrument unit, the same in every locale. */
export function gainLabel(db: number): string {
  return `GAIN +${db} dB`;
}
