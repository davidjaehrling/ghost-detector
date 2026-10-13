import { drawOutcome, freshHistory, generateProfile } from '../../engine';
import type { ScanRecord } from '../../state/scans';
import type { FixtureName } from '../fixtureNames';

// Harness only (?static=1&demo=quiet|active|strong|critical&case=0002 on /result/demo).
// Seeds were found by scanning seeds 1.. with drawOutcome(seed, 'standard',
// freshHistory()) and taking the first that gave: QUIET with SPI 8 to 14;
// ACTIVE with a figure and SPI 55 to 62; CRITICAL with SPI 94 or more.
// Results: 8 -> QUIET 12, 95 -> ACTIVE 62 (figure), 41 -> STRONG 80 (figure, first STRONG
// with a figure from seed 1), 67 -> CRITICAL 94 (figure).
export const DEMO_SEEDS = { quiet: 8, active: 95, strong: 41, critical: 67 } as const;
export type DemoName = keyof typeof DEMO_SEEDS;

// The ACTIVE demo over the other photos has its own seed (so its class, era and designation
// differ from the cellar's), found the same way: ACTIVE with a figure, SPI 52 to 64, no jump scare.
// 311 -> VESTIGE 61 (bright); 242 -> STATIC 59 (outdoors). The attic and black seeds were then
// picked from the same list as the ones whose figure lifts the L2 measurement into its 8 to 20
// target on a plain run: 221 -> THRESHOLD 55 (attic); 171 -> LINGERER 58 (black).
const FIXTURE_ACTIVE_SEEDS: Partial<Record<FixtureName, number>> = { bright: 311, outdoors: 242, attic: 221, black: 171 };

export function isDemoName(v: unknown): v is DemoName {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(DEMO_SEEDS, v);
}

export function demoRecord(name: DemoName, photoUri: string, id = '0001', fixture?: FixtureName | null, seedOverride?: number): ScanRecord {
  const seed = seedOverride ?? (name === 'active' && fixture ? FIXTURE_ACTIVE_SEEDS[fixture] : undefined) ?? DEMO_SEEDS[name];
  const outcome = drawOutcome(seed, 'standard', freshHistory(0));
  const profile = generateProfile((seed ^ 0x9e3779b9) >>> 0, outcome.tier, { names: [], lines: [] });
  return { id, createdAt: 0, photoUri, seed, outcome, profile };
}
