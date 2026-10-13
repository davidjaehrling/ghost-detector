import { TIERS } from '../../engine';
import type { ScanRecord } from '../../state/scans';

export const NO_PRIOR = 'NO PRIOR CASES';

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// The peak reading of the earlier cases (psych brief 2.6: peak, never an average).
// The case on screen is left out, so a first scan has nothing to compare with.
// Ties go to the later case.
export function bestSoFar(records: readonly ScanRecord[], excludeId?: string): { prefix: string; value: string } | null {
  const prior = records.filter((r) => r.id !== excludeId);
  if (prior.length === 0) return null;
  let best = prior[0]!;
  for (const r of prior) if (r.outcome.spi >= best.outcome.spi) best = r;
  const tier = TIERS.includes(best.outcome.tier) ? best.outcome.tier.toUpperCase() : '';
  const parts = [`${best.outcome.spi} ${tier}`, best.tag ? best.tag.toUpperCase() : '', hhmm(best.createdAt)].filter(Boolean);
  return { prefix: 'BEST SO FAR:', value: parts.join(' · ') };
}
