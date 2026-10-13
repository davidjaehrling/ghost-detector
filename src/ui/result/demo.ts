import { drawOutcome, freshHistory, generateProfile } from '../../engine';
import type { ScanRecord } from '../../state/scans';

// Harness only (?static=1&demo=quiet|active|critical on /result/demo).
// Seeds were found by scanning seeds 1.. with drawOutcome(seed, 'standard',
// freshHistory()) and taking the first that gave: QUIET with SPI 8 to 14;
// ACTIVE with a figure and SPI 55 to 62; CRITICAL with SPI 94 or more.
// Results: 8 -> QUIET 12, 95 -> ACTIVE 62 (figure), 67 -> CRITICAL 94 (figure).
export const DEMO_SEEDS = { quiet: 8, active: 95, critical: 67 } as const;
export type DemoName = keyof typeof DEMO_SEEDS;

export function isDemoName(v: unknown): v is DemoName {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(DEMO_SEEDS, v);
}

export function demoRecord(name: DemoName, photoUri: string): ScanRecord {
  const seed = DEMO_SEEDS[name];
  const outcome = drawOutcome(seed, 'standard', freshHistory(0));
  const profile = generateProfile((seed ^ 0x9e3779b9) >>> 0, outcome.tier, []);
  return { id: '0001', createdAt: 0, photoUri, seed, outcome, profile };
}
