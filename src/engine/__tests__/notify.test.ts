import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TEMPLATES, BACKOFF_IGNORED, CAP_PER_WEEK, CATALOGUE_SIZE, CLAIM_WORDS,
  MIN_AFTER_INSTALL_MS, PRIORITY, STALE_AFTER_MS, WEEK_MS, WINDOW_END_MIN, WINDOW_START_MIN, DELIVERY_END_MIN,
  applyIntensityChange, deliveryMinute, effectiveCap, forecastIndex, localDayNumber, localMinuteOfDay,
  nextNotification, withinWeeklyCap,
  type Notification, type NotifyState, type ScanSummary, type SentItem, type TemplateId,
} from '../notify';
import type { Intensity } from '../outcome';
import { activityIndex } from '../../ui/boot/activity';
import { mulberry32 } from '../rng';
import { TIERS } from '../tiers';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const T0 = Date.UTC(2026, 9, 14, 8, 0, 0); // 2026-10-14 08:00 UTC

function base(over: Partial<NotifyState> = {}): NotifyState {
  return {
    intensity: 'standard', belief: 'unsure', jumpScaresOff: false, sessionCount: 3, optedIn: true,
    installMs: T0 - 5 * DAY_MS, lastAppOpenMs: T0 - HOUR_MS, scans: [], loggedTags: [], catalogueCount: 7,
    sent: [], nowMs: T0, utcOffsetMin: 0, ...over,
  };
}
function scan(over: Partial<ScanSummary> = {}): ScanSummary {
  return { caseId: 41, atMs: T0 - DAY_MS, tier: 'active', spi: 55, decodedPct: 63, decoded: false, declined: false, newClass: false, tags: [], ...over };
}

function randomState(seed: number): NotifyState {
  const r = mulberry32(seed);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
  const nowMs = T0 + Math.floor(r() * 400 * DAY_MS);
  const utcOffsetMin = pick([-480, -300, 0, 60, 120, 330, 540]);
  const installMs = nowMs - Math.floor(r() * 30 * DAY_MS);
  const scans: ScanSummary[] = [];
  const nScans = Math.floor(r() * 8);
  for (let i = 0; i < nScans; i++) {
    scans.push({
      caseId: 1 + i, atMs: nowMs - Math.floor(r() * 10 * DAY_MS), tier: pick(TIERS), spi: Math.floor(r() * 101),
      decodedPct: Math.floor(r() * 101), decoded: r() < 0.3, declined: r() < 0.25, newClass: r() < 0.4, tags: [],
    });
  }
  const tags = ['cellar', 'attic', 'hall', 'kitchen', 'Bedroom', 'unit 7'];
  const loggedTags = Array.from({ length: Math.floor(r() * 9) }, () => pick(tags));
  const sent: SentItem[] = [];
  const nSent = r() < 0.5 ? 0 : Math.floor(r() * 4);
  for (let i = 0; i < nSent; i++) {
    sent.push({
      templateId: pick([1, 2, 3, 4, 5] as TemplateId[]),
      caseId: r() < 0.5 ? 1 + Math.floor(r() * 8) : undefined,
      sentAtMs: nowMs - Math.floor(r() * 10 * DAY_MS) + Math.floor(r() * 3 * DAY_MS),
      opened: r() < 0.5,
    });
  }
  return {
    intensity: pick<Intensity>(['calm', 'standard', 'brave']), belief: pick(['yes', 'unsure', 'no'] as const),
    jumpScaresOff: r() < 0.2, sessionCount: r() < 0.15 ? Math.floor(r() * 2) : 2 + Math.floor(r() * 5), optedIn: r() < 0.85, installMs,
    lastAppOpenMs: nowMs - Math.floor(r() * 8 * DAY_MS), scans, loggedTags, catalogueCount: Math.floor(r() * 26),
    sent, nowMs, utcOffsetMin,
  };
}

const N = 10_000;
const cases = Array.from({ length: N }, (_, i) => {
  const s = randomState(i + 1);
  return { s, seed: i * 7919 + 3, n: nextNotification(s, i * 7919 + 3) };
});
const fired = cases.filter((c): c is typeof c & { n: Notification } => c.n !== null);

describe('constants pinned', () => {
  it('match the brief', () => {
    expect(CAP_PER_WEEK).toEqual({ calm: 1, standard: 2, brave: 3 });
    expect(ALLOWED_TEMPLATES.calm).toEqual([2, 5]);
    expect(PRIORITY).toEqual([2, 3, 1, 5, 4]);
    expect([WINDOW_START_MIN, WINDOW_END_MIN]).toEqual([1080, 1320]);
    expect(DELIVERY_END_MIN).toBe(1290);
    expect(MIN_AFTER_INSTALL_MS).toBe(20 * HOUR_MS);
    expect(STALE_AFTER_MS).toBe(7 * DAY_MS);
    expect(BACKOFF_IGNORED).toBe(2);
    expect(CATALOGUE_SIZE).toBe(24);
  });
});

describe('generator guard', () => {
  it('at least 2000 of 10000 states schedule something', () => {
    expect(fired.length).toBeGreaterThanOrEqual(2000);
  });
  it('every template is produced', () => {
    for (const id of [1, 2, 3, 4, 5]) expect(fired.some((c) => c.n.templateId === id)).toBe(true);
  });
});

describe('rules over 10000 random states', () => {
  it('opt-in and not in the first session', () => {
    for (const c of cases) if (!c.s.optedIn || c.s.sessionCount < 2) expect(c.n).toBeNull();
  });
  it('fires only in 18:00 to 21:30 local, in the future', () => {
    for (const { s, n } of fired) {
      const m = localMinuteOfDay(n.fireAtMs, s.utcOffsetMin);
      expect(m).toBeGreaterThanOrEqual(WINDOW_START_MIN);
      expect(m).toBeLessThanOrEqual(DELIVERY_END_MIN);
      expect(n.fireAtMs).toBeGreaterThan(s.nowMs);
    }
  });
  it('first delivery is on a later calendar day and 20 h after install', () => {
    for (const { s, n } of fired) {
      expect(n.fireAtMs - s.installMs).toBeGreaterThanOrEqual(MIN_AFTER_INSTALL_MS);
      expect(localDayNumber(n.fireAtMs, s.utcOffsetMin)).toBeGreaterThan(localDayNumber(s.installMs, s.utcOffsetMin));
    }
  });
  it('at most one per night', () => {
    for (const { s, n } of fired) {
      const day = localDayNumber(n.fireAtMs, s.utcOffsetMin);
      expect(s.sent.some((x) => localDayNumber(x.sentAtMs, s.utcOffsetMin) === day)).toBe(false);
    }
  });
  it('weekly caps hold over every 7 day window', () => {
    for (const { s, n } of fired) {
      expect(withinWeeklyCap([...s.sent.map((x) => x.sentAtMs), n.fireAtMs], effectiveCap(s))).toBe(true);
      expect(effectiveCap(s)).toBeLessThanOrEqual(CAP_PER_WEEK[s.intensity]);
    }
  });
  it('calm sends only moon and catalogue', () => {
    for (const { s, n } of fired) if (s.intensity === 'calm') expect([2, 5]).toContain(n.templateId);
  });
  it('template 4 once per case, never declined, never calm, never resolved', () => {
    const t4 = fired.filter((c) => c.n.templateId === 4);
    expect(t4.length).toBeGreaterThan(50);
    for (const { s, n } of t4) {
      expect(s.intensity).not.toBe('calm');
      const rec = s.scans.find((r) => r.caseId === n.caseId)!;
      expect(rec.declined).toBe(false);
      expect(rec.decoded).toBe(false);
      expect(s.sent.some((x) => x.templateId === 4 && x.caseId === n.caseId)).toBe(false);
      expect(n.fireAtMs - rec.atMs).toBeLessThanOrEqual(7 * DAY_MS);
    }
  });
  it('two ignored in a row drop one cap level', () => {
    const mk = (opened: boolean[]): SentItem[] => opened.map((o, i) => ({ templateId: 2, sentAtMs: T0 - (opened.length - i) * 10 * DAY_MS, opened: o }));
    expect(effectiveCap(base({ intensity: 'brave', sent: mk([false, false]) }))).toBe(2);
    expect(effectiveCap(base({ intensity: 'brave', sent: mk([false, true]) }))).toBe(3);
    expect(effectiveCap(base({ intensity: 'brave', sent: mk([true, false, false]) }))).toBe(2);
    expect(effectiveCap(base({ intensity: 'standard', sent: mk([false, false]) }))).toBe(1);
    expect(effectiveCap(base({ intensity: 'calm', sent: mk([false, false]) }))).toBe(1);
    expect(effectiveCap(base({ intensity: 'brave', jumpScaresOff: true }))).toBe(2);
  });
  it('7 days with no open stops scheduling, and nothing lands past that', () => {
    expect(nextNotification(base({ lastAppOpenMs: T0 - 7 * DAY_MS, scans: [scan()] }), 1)).toBeNull();
    for (const { s, n } of fired) expect(n.fireAtMs - s.lastAppOpenMs).toBeLessThan(STALE_AFTER_MS);
  });
  it('deterministic for a seed', () => {
    for (const c of cases.slice(0, 500)) expect(nextNotification(c.s, c.seed)).toEqual(c.n);
  });
});

const lintSrc = readFileSync(new URL('../../../scripts/lint-copy.mjs', import.meta.url), 'utf8');
const wordRe = new RegExp(/const wordRe = \/(.*)\/i;/.exec(lintSrc)![1]!, 'i');
const claimRe = new RegExp(`\\b(${CLAIM_WORDS.join('|')})\\b`, 'i');

describe('copy', () => {
  it('every title and body passes the word rules, claim words, EVP, em-dash', () => {
    for (const { n } of fired) {
      for (const text of [n.title, n.body]) {
        expect(text).not.toMatch(wordRe);
        expect(text).not.toMatch(claimRe);
        expect(text).not.toMatch(/evp|["“”]/i);
        expect(text).not.toContain(String.fromCharCode(0x2014));
        expect(text).not.toMatch(/\bnot\s+(?:just|only|merely)?\s*\w+(?:\s+\w+){0,3},?\s+but\b/i);
        expect(text).not.toMatch(/\b(reward|video|ad|ads|unlock|free|watch|deadline|expires?|now|warning|alert|urgent|security)\b/i);
      }
      expect(n.title.startsWith('FIELD LOG')).toBe(true);
    }
  });
});

// Find a seed and offset where a given template fires, then assert text.
function firstOf(id: TemplateId, mk: (extra: number) => NotifyState): Notification {
  for (let k = 0; k < 400; k++) {
    for (let seed = 1; seed < 5; seed++) {
      const n = nextNotification(mk(k), seed);
      if (n && n.templateId === id) return n;
    }
  }
  throw new Error(`template ${id} never fired`);
}
// Moves "now" in whole days; the sky index/moon vary across them.
const day = (k: number) => T0 + k * DAY_MS;

describe('templates', () => {
  it('1: index title with time, all-number body', () => {
    const n = firstOf(1, (k) => base({ nowMs: day(k), lastAppOpenMs: day(k) - HOUR_MS, installMs: day(k) - 5 * DAY_MS }));
    expect(n.title).toMatch(/^FIELD LOG · IDX [45]\/5 AT 22:00$/);
    expect(n.body).toMatch(/^Moon \d+%\. Forecast [45]\/5 after 22:00\. [45]\/5 at 03:00\.$/);
    expect(n.body).not.toMatch(/window peaks/);
    expect(n.body).not.toMatch(/favourable/i);
  });
  it('2: full moon forecast wording, once per cycle', () => {
    const mk = (sent: SentItem[]) => (k: number) => base({ nowMs: day(k), lastAppOpenMs: day(k) - HOUR_MS, installMs: day(k) - 5 * DAY_MS, sent });
    const n = firstOf(2, mk([]));
    expect(n.title).toMatch(/^FIELD LOG · MOON (9[7-9]|100)%$/);
    expect(n.body).toMatch(/^Full moon\. Forecast index [1-5]\/5 from 22:00\. [1-5]\/5 at 03:00\.$/);
    expect(forecastIndex(n.fireAtMs, 0).moonPct).toBeGreaterThan(96);
    const again = nextNotification(base({ nowMs: n.fireAtMs - 5 * HOUR_MS, lastAppOpenMs: n.fireAtMs - 6 * HOUR_MS, intensity: 'brave', sent: [{ templateId: 2, sentAtMs: n.fireAtMs - 2 * DAY_MS, opened: true }] }), 1);
    expect(again?.templateId).not.toBe(2);
  });
  it('3: tag with 2+ cases, forecast wording, lore only for believers', () => {
    const mk = (belief: 'yes' | 'no') => (k: number) => base({ belief, nowMs: day(k), lastAppOpenMs: day(k) - HOUR_MS, installMs: day(k) - 5 * DAY_MS, loggedTags: ['Cellar', 'cellar', 'cellar', 'attic'] });
    const y = firstOf(3, mk('yes'));
    expect(y.title).toBe('FIELD LOG · CELLAR');
    expect(y.body).toMatch(/^Cellar on file, 3 cases\. Forecast index [45]\/5 after 22:00\. Cellars hold cold air\.$/);
    const no = firstOf(3, mk('no'));
    expect(no.body).toMatch(/^Cellar on file, 3 cases\. Forecast index [45]\/5 after 22:00\.$/);
    expect(y.body.split('. ').pop()!.replace('.', '').split(' ').length).toBeLessThanOrEqual(8);
  });
  it('4: unresolved signature, no reward, no deadline', () => {
    const n = nextNotification(base({ scans: [scan({ caseId: 41, decodedPct: 63 })] }), 5);
    expect(n).not.toBeNull();
    // other templates may win on a given night; scan seeds until template 4 shows
    const t4 = firstOf(4, (k) => base({ nowMs: day(k), lastAppOpenMs: day(k) - HOUR_MS, installMs: day(k) - 9 * DAY_MS, scans: [scan({ caseId: 41, atMs: day(k) - DAY_MS, decodedPct: 63 })] }));
    expect(t4.title).toBe('FIELD LOG · CASE 0041');
    expect(t4.body).toBe('Signature 63% decoded. Unresolved.');
    expect(t4.caseId).toBe(41);
  });
  it('5: catalogue, unlogged wording', () => {
    const n = firstOf(5, (k) => base({ nowMs: day(k), lastAppOpenMs: day(k) - HOUR_MS, installMs: day(k) - 9 * DAY_MS, catalogueCount: 7, scans: [scan({ decoded: true, newClass: true, decodedPct: 100 })] }));
    expect(n.title).toBe('FIELD LOG · CATALOGUE 7/24');
    expect(n.body).toBe('17 classes unlogged.');
    const withLast = firstOf(5, (k) => base({ nowMs: day(k), lastAppOpenMs: day(k) - HOUR_MS, installMs: day(k) - 9 * DAY_MS, catalogueCount: 7, lastLoggedClass: 'Residual', scans: [scan({ decoded: true, newClass: true, decodedPct: 100 })] }));
    expect(withLast.body).toBe('17 classes unlogged. Last logged: Residual.');
  });
  it('5: once per catalogueCount', () => {
    const mk = (sent: SentItem[], count: number) => (k: number) => base({ nowMs: day(k), lastAppOpenMs: day(k) - HOUR_MS, installMs: day(k) - 9 * DAY_MS, catalogueCount: count, sent, scans: [scan({ decoded: true, newClass: true, decodedPct: 100, atMs: day(k) - HOUR_MS })] });
    const sent: SentItem[] = [{ templateId: 5, sentAtMs: T0 - 30 * DAY_MS, opened: true, catalogueCount: 7 }];
    for (let k = 0; k < 60; k++) for (let seed = 1; seed < 4; seed++) expect(nextNotification(mk(sent, 7)(k), seed)?.templateId).not.toBe(5);
    expect(firstOf(5, mk(sent, 8)).title).toBe('FIELD LOG · CATALOGUE 8/24');
  });
  it('priority: moon beats tag beats index beats catalogue beats case', () => {
    expect(PRIORITY).toEqual([2, 3, 1, 5, 4]);
    const counts = new Map<number, number>();
    for (const { n } of fired) counts.set(n.templateId, (counts.get(n.templateId) ?? 0) + 1);
    expect(counts.size).toBe(5);
  });
});

describe('forecastIndex matches the viewfinder activityIndex', () => {
  it('equal over 1000 timestamps and offsets', () => {
    const r = mulberry32(2026);
    let hits4 = 0;
    for (let i = 0; i < 1000; i++) {
      const ms = T0 + Math.floor((r() - 0.3) * 800 * DAY_MS);
      const d = new Date(ms);
      // Device zone offset at that instant, in the engine's sign (UTC+2 = 120).
      const off = -d.getTimezoneOffset();
      const a = activityIndex(d);
      const b = forecastIndex(ms, off);
      expect(b).toEqual(a);
      if (a.index >= 4) hits4++;
    }
    expect(hits4).toBeGreaterThan(20);
  });
});

describe('applyIntensityChange', () => {
  const pending = [
    { id: 'a', templateId: 2 as TemplateId, fireAtMs: T0 + 1 * DAY_MS },
    { id: 'b', templateId: 4 as TemplateId, fireAtMs: T0 + 2 * DAY_MS },
    { id: 'c', templateId: 5 as TemplateId, fireAtMs: T0 + 3 * DAY_MS },
  ];
  it('switch to Calm cancels everything and reschedules', () => {
    const r = applyIntensityChange({ intensity: 'standard' }, base({ intensity: 'calm' }), pending);
    expect(r).toEqual({ cancelIds: ['a', 'b', 'c'], reschedule: true });
  });
  it('Brave to Standard keeps two inside a week, cancels the third', () => {
    const r = applyIntensityChange({ intensity: 'brave' }, base({ intensity: 'standard' }), pending);
    expect(r.cancelIds).toEqual(['c']);
  });
  it('jump-scares off lowers the cap too', () => {
    const r = applyIntensityChange({ intensity: 'brave' }, base({ intensity: 'brave', jumpScaresOff: true }), pending);
    expect(r.cancelIds).toEqual(['c']);
  });
  it('no change cancels nothing', () => {
    const r = applyIntensityChange({ intensity: 'brave' }, base({ intensity: 'brave' }), pending);
    expect(r).toEqual({ cancelIds: [], reschedule: false });
  });
  it('property: kept items obey template set and weekly cap', () => {
    const rnd = mulberry32(99);
    for (let i = 0; i < 2000; i++) {
      const s = randomState(i + 50_000);
      const p = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, k) => ({
        id: `p${k}`, templateId: (1 + Math.floor(rnd() * 5)) as TemplateId, fireAtMs: s.nowMs + Math.floor(rnd() * 12 * DAY_MS) + 1,
      }));
      const r = applyIntensityChange({ intensity: 'brave' }, s, p);
      const kept = p.filter((x) => !r.cancelIds.includes(x.id));
      for (const k of kept) expect(ALLOWED_TEMPLATES[s.intensity]).toContain(k.templateId);
      const sentPast = s.sent.filter((x) => x.sentAtMs <= s.nowMs).map((x) => x.sentAtMs);
      if (s.intensity === 'calm') expect(kept).toHaveLength(0);
      else if (withinWeeklyCap(sentPast, effectiveCap(s))) expect(withinWeeklyCap([...sentPast, ...kept.map((x) => x.fireAtMs)], effectiveCap(s))).toBe(true);
    }
  });
});
void WEEK_MS;

describe('quoted numbers come from the forecast index and the moon', () => {
  const states = Array.from({ length: 1000 }, (_, i) => {
    const st = randomState(50_000 + i);
    st.lastLoggedClass = i % 2 ? 'Residual' : undefined;
    // widen the odds that numbered templates are produced
    st.optedIn = true; st.sessionCount = 3; st.lastAppOpenMs = st.nowMs - HOUR_MS; st.intensity = i % 3 === 0 ? 'calm' : 'brave';
    st.sent = []; st.loggedTags = ['cellar', 'cellar', 'attic', 'attic'];
    st.scans = [scan({ caseId: 3, atMs: st.nowMs - DAY_MS, decoded: true, newClass: true, decodedPct: 100 }), scan({ caseId: 4, atMs: st.nowMs - DAY_MS, decodedPct: 60 })];
    return st;
  });
  it('every N/5 equals forecastIndex at the named hour; every m% equals the moon at delivery', () => {
    let checked = 0; const seen = new Set<number>();
    for (const [i, s] of states.entries()) {
      const n = nextNotification(s, i);
      if (!n) continue;
      seen.add(n.templateId);
      const dayStart = Math.floor((n.fireAtMs + s.utcOffsetMin * 60_000) / DAY_MS) * DAY_MS - s.utcOffsetMin * 60_000;
      const i22 = forecastIndex(dayStart + 22 * HOUR_MS, s.utcOffsetMin).index;
      const i03 = forecastIndex(dayStart + 27 * HOUR_MS, s.utcOffsetMin).index;
      const moon = forecastIndex(n.fireAtMs, s.utcOffsetMin).moonPct;
      for (const m of n.title.matchAll(/IDX (\d+)\/5/g)) { expect(+m[1]!).toBe(i22); checked++; }
      for (const m of n.body.matchAll(/(?:index|Forecast) (\d+)\/5/g)) { expect(+m[1]!).toBe(i22); checked++; }
      for (const m of n.body.matchAll(/(\d+)\/5 at 03:00/g)) { expect(+m[1]!).toBe(i03); checked++; }
      for (const m of `${n.title} ${n.body}`.matchAll(/(?:MOON|Moon) (\d+)%/g)) { expect(+m[1]!).toBe(moon); checked++; }
      const slashes = (`${n.title} ${n.body}`.match(/\d+\/5/g) ?? []).length;
      const covered = (n.title.match(/IDX \d+\/5/g) ?? []).length + (n.body.match(/(?:index|Forecast) \d+\/5/g) ?? []).length + (n.body.match(/\d+\/5 at 03:00/g) ?? []).length;
      expect(slashes).toBe(covered);
    }
    expect(checked).toBeGreaterThan(100);
    expect(seen.has(1) || seen.has(2) || seen.has(3)).toBe(true);
  });
});

describe('delivery minute', () => {
  it('is inside the window, fixed per install, and shared across nights', () => {
    for (let i = 0; i < 500; i++) {
      const installMs = T0 + i * 7_919_000;
      const m = deliveryMinute(installMs);
      expect(m).toBeGreaterThanOrEqual(WINDOW_START_MIN);
      expect(m).toBeLessThanOrEqual(DELIVERY_END_MIN);
      expect(deliveryMinute(installMs)).toBe(m);
    }
    const spread = new Set(Array.from({ length: 200 }, (_, i) => deliveryMinute(T0 + i * 86_413_000)));
    expect(spread.size).toBeGreaterThan(60);
  });
  it('two nights of one install fire at the same local minute', () => {
    for (const off of [0, 120, -300]) {
      const s = base({ utcOffsetMin: off, intensity: 'brave', belief: 'no', loggedTags: ['cellar', 'cellar'], catalogueCount: 7, scans: [scan({ decoded: true, newClass: true, decodedPct: 100, atMs: T0 })] });
      const a = nextNotification(s, 1)!;
      const b = nextNotification({ ...s, sent: [{ templateId: a.templateId, sentAtMs: a.fireAtMs, opened: true }] }, 2)!;
      expect(a && b).toBeTruthy();
      expect(localDayNumber(b.fireAtMs, off)).toBeGreaterThan(localDayNumber(a.fireAtMs, off));
      expect(localMinuteOfDay(a.fireAtMs, off)).toBe(localMinuteOfDay(b.fireAtMs, off));
      expect(localMinuteOfDay(a.fireAtMs, off)).toBe(deliveryMinute(s.installMs));
    }
  });
});
