import type { Tier } from '../../engine';
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
  return `CASE ${id} · SPI ${spi} · ΔT ${deltaC.toFixed(1)} °C · ${clock(createdAt)}`;
}

/**
 * The strip as the result screen draws it: the card's data run plus ` · SIMULATED`, so a plain
 * screenshot carries the mark (D-034). The share card prints the same two parts itself
 * (src/fx/share/text.ts), so `stampText` stays the data run alone.
 */
export const screenStampText = (d: Parameters<typeof stampText>[0]): string => `${stampText(d)} · SIMULATED`;
