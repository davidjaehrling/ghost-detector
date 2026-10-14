import { type ScanRecord, seedScans } from '../../state/scans';
import { demoRecord } from '../result/demo';
import type { FixtureName } from '../fixtureNames';
import { fixtureUri } from '../fixtures';

// Harness only (?static=1&log=demo3 on /history): three location tags with cases, written to the
// store once so the log golden is the same on every run and a row opens a real stored result. The
// STRONG cellar case is the result golden's own demo case (same id, seed, photo and time), so a
// reopened case can be compared with result-strong.png.
const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).getTime();

type Spec = { demo: 'quiet' | 'active' | 'strong' | 'critical'; id: string; tag: string; fixture: FixtureName; createdAt: number; seed?: number; declined?: boolean };

const SPECS: readonly Spec[] = [
  { demo: 'quiet', id: '0001', tag: 'cellar', fixture: 'cellar', createdAt: at(11, 22, 15) },
  { demo: 'strong', id: '0003', tag: 'cellar', fixture: 'cellar', createdAt: at(13, 22, 48) },
  { demo: 'active', id: '0007', tag: 'cellar', fixture: 'cellar', createdAt: at(12, 23, 41) },
  { demo: 'critical', id: '0004', tag: 'attic', fixture: 'attic', createdAt: at(12, 21, 30) },
  { demo: 'active', id: '0006', tag: 'attic', fixture: 'attic', createdAt: at(12, 20, 40), seed: 221, declined: true },
  { demo: 'quiet', id: '0002', tag: 'bedroom', fixture: 'bright', createdAt: at(10, 20, 5) },
  { demo: 'active', id: '0005', tag: 'bedroom', fixture: 'bright', createdAt: at(9, 22, 10), seed: 311 },
];

export function isDemoLog(search: string): boolean {
  return new URLSearchParams(search).get('log') === 'demo3';
}

export function demoLogRecords(): ScanRecord[] {
  return SPECS.map((s) => ({ ...demoRecord(s.demo, fixtureUri(s.fixture), s.id, s.fixture, s.seed), tag: s.tag, createdAt: s.createdAt, ...(s.declined ? { declined: true } : {}) }));
}

export function seedDemoLog(): void {
  seedScans(demoLogRecords());
}
