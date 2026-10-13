/**
 * Seeded entity profile. Barnum-style: high base-rate lines plus one
 * checkable-sounding code (psych-brief 2.5, voice guide section 2).
 */
import { mulberry32 } from './rng';
import { ATTACHMENT, BEHAVIOUR, CLASSES, DETAIL, ERA_ANCHORS, PREFIXES, TEMPERAMENT, TIMING } from './profileBank';
import type { Tier } from './tiers';

export interface EntityProfile {
  class: string;
  /** e.g. "Era est. 1890 to 1940" */
  era: string;
  /** Catalogue designation, e.g. "RSD-0417-C". Never a human name. */
  name: string;
  /** 3 to 5 lines. */
  traits: string[];
  /** Percent decoded. 41 to 73 for ACTIVE and above, lower below. */
  signatureDecodedPct: number;
}

/** Names are searched this many times for one outside `recent` before a suffix is forced. */
const NAME_ATTEMPTS = 64;

const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)]!;

function decodedPct(r: () => number, tier: Tier): number {
  switch (tier) {
    case 'quiet': return int(r, 4, 14);
    case 'trace': return int(r, 15, 38);
    default: return int(r, 41, 73);
  }
}

function detailLine(r: () => number, used: ReadonlySet<string>): string {
  let line = '';
  for (let a = 0; a < NAME_ATTEMPTS; a++) {
    line = pick(r, DETAIL)
      .replace('{n4}', String(int(r, 1, 9999)).padStart(4, '0'))
      .replace('{n}', String(int(r, 112, 4890)))
      .replace('{dt}', `-${int(r, 2, 8)}.${int(r, 0, 9)}`);
    if (!used.has(line)) break;
  }
  return line;
}

/** What the caller has shown recently (oldest first). The engine reads the last 20 results' worth. */
export interface RecentProfiles {
  names: string[];
  /** Trait lines of recent results, oldest first. Pass them all; the window is the caller's last 20 results. */
  lines: string[];
}

/** Pick a bank line not in `used`; if the bank is exhausted, reuse the least recently used one. */
function pickFresh(r: () => number, bank: readonly string[], used: ReadonlySet<string>, order: readonly string[]): string {
  const fresh = bank.filter((l) => !used.has(l));
  if (fresh.length > 0) return pick(r, fresh);
  let best = bank[0]!;
  let bestAt = Infinity;
  for (const l of bank) {
    const at = order.lastIndexOf(l);
    if (at < bestAt) { bestAt = at; best = l; }
  }
  return best;
}

export function generateProfile(seed: number, tier: Tier, recent: RecentProfiles): EntityProfile;
/** @deprecated Pass `{ names, lines }`. A bare array is treated as names only. */
export function generateProfile(seed: number, tier: Tier, recentNames: string[]): EntityProfile;
// TODO remove the string[] overload once all callers pass { names, lines }
export function generateProfile(seed: number, tier: Tier, recentArg: RecentProfiles | string[]): EntityProfile {
  const recent: RecentProfiles = Array.isArray(recentArg) ? { names: recentArg, lines: [] } : recentArg;
  const r = mulberry32(seed);
  const ci = Math.floor(r() * CLASSES.length);

  const used = new Set(recent.names.slice(-20));
  const usedLines = new Set(recent.lines);
  let name = '';
  for (let a = 0; a < NAME_ATTEMPTS; a++) {
    const n = String(int(r, 1, 9999)).padStart(4, '0');
    const sfx = String.fromCharCode(65 + int(r, 0, 25));
    name = `${PREFIXES[ci]}-${n}-${sfx}`;
    if (!used.has(name)) break;
  }
  // Practically unreachable, but the no-repeat guarantee must hold.
  for (let n = 0; used.has(name); n++) name = `${PREFIXES[ci]}-${String(n % 10000).padStart(4, '0')}-${String.fromCharCode(65 + (n % 26))}`;

  const start = pick(r, ERA_ANCHORS) + int(r, 0, 9);
  const span = int(r, 40, 80);
  const era = `Era est. ${start} to ${start + span}`;

  // One line per slot, in a seeded order; the detail line is one of the slots.
  const slots: (() => string)[] = [
    () => pickFresh(r, TEMPERAMENT, usedLines, recent.lines),
    () => pickFresh(r, ATTACHMENT, usedLines, recent.lines),
    () => pickFresh(r, BEHAVIOUR, usedLines, recent.lines),
    () => pickFresh(r, TIMING, usedLines, recent.lines),
    () => detailLine(r, usedLines),
  ];
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [slots[i], slots[j]] = [slots[j]!, slots[i]!];
  }
  const count = int(r, 3, 5);
  const traits = slots.slice(0, count).map((f) => f());

  return { class: CLASSES[ci]!, era, name, traits, signatureDecodedPct: decodedPct(r, tier) };
}
