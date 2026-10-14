import type { Tier } from '../engine';
import { t } from '../i18n';

const TIER_KEY: Record<Tier, string> = {
  quiet: 'result.tier.quiet',
  trace: 'result.tier.trace',
  active: 'result.tier.active',
  strong: 'result.tier.strong',
  critical: 'result.tier.critical',
};

/** The tier name as the instrument prints it: QUIET, TRACE, ACTIVE, STRONG, CRITICAL. */
export const tierWord = (tier: Tier): string => t(TIER_KEY[tier]);
