import { TIERS } from '../../engine';
import { t } from '../../i18n';
import { tagLabel } from '../../state/log';
import type { ScanRecord } from '../../state/scans';
import { tierWord } from '../../state/tierWord';

export const noPrior = () => t('result.best.none');

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
  const tier = TIERS.includes(best.outcome.tier) ? tierWord(best.outcome.tier) : '';
  const parts = [`${best.outcome.spi} ${tier}`, best.tag ? tagLabel(best.tag) : '', hhmm(best.createdAt)].filter(Boolean);
  return { prefix: t('result.best.prefix'), value: parts.join(' · ') };
}
