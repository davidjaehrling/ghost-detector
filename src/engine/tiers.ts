/**
 * SPI tiers. Lower bounds copied from docs/instrument-bible.md section 3
 * (0/20/45/70/90); a test checks them against the Bible and src/ui/tokens.ts.
 * The engine never imports UI code.
 */
export const TIER_BOUNDS = { quiet: 0, trace: 20, active: 45, strong: 70, critical: 90 } as const;

export type Tier = keyof typeof TIER_BOUNDS;

export const TIERS: readonly Tier[] = ['quiet', 'trace', 'active', 'strong', 'critical'];

/** Inclusive SPI band of a tier. */
export function tierBand(t: Tier): { min: number; max: number } {
  const i = TIERS.indexOf(t);
  const next = TIERS[i + 1];
  return { min: TIER_BOUNDS[t], max: next ? TIER_BOUNDS[next] - 1 : 100 };
}

export function tierOf(spi: number): Tier {
  for (let i = TIERS.length - 1; i > 0; i--) if (spi >= TIER_BOUNDS[TIERS[i]!]) return TIERS[i]!;
  return 'quiet';
}
