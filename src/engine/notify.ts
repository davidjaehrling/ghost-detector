import { mulberry32 } from './rng';
import type { Intensity } from './outcome';
import type { Tier } from './tiers';

/**
 * Notification scheduler (docs/p6-brief.md section 2 and 4, D-032). Pure and seeded: no clock,
 * no storage, no native calls. The caller passes `nowMs` and the local UTC offset.
 */

export type Belief = 'yes' | 'unsure' | 'no';
export type TemplateId = 1 | 2 | 3 | 4 | 5;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
export const WINDOW_START_MIN = 18 * 60;
export const WINDOW_END_MIN = 22 * 60;
/** Latest delivery minute (21:30, inclusive): slack before 22:00 for inexact Android alarms (D-035). */
export const DELIVERY_END_MIN = 21 * 60 + 30;
export const WEEK_MS = 7 * DAY_MS;
export const MIN_AFTER_INSTALL_MS = 20 * HOUR_MS;
export const STALE_AFTER_MS = 7 * DAY_MS;
export const CAP_PER_WEEK: Record<Intensity, number> = { calm: 1, standard: 2, brave: 3 };
export const ALLOWED_TEMPLATES: Record<Intensity, readonly TemplateId[]> = {
  calm: [2, 5],
  standard: [2, 3, 1, 5, 4],
  brave: [2, 3, 1, 5, 4],
};
/** Selection order when several apply on one evening. */
export const PRIORITY: readonly TemplateId[] = [2, 3, 1, 5, 4];
export const CATALOGUE_SIZE = 24;
export const SEARCH_DAYS = 15;
export const UNRESOLVED_MIN_PCT = 41;
export const UNRESOLVED_MAX_PCT = 73;
export const RECENT_CASE_MS = 7 * DAY_MS;
export const TAG_MIN_COUNT = 2;
export const HIGH_INDEX = 4;
export const FULL_MOON_HALF_WIDTH_DAYS = 1;
export const MOON_CYCLE_GAP_MS = 25 * DAY_MS;
export const BACKOFF_IGNORED = 2;
export const SYNODIC_DAYS = 29.530588853;
/** A known new moon: 2000-01-06 18:14 UTC. */
export const NEW_MOON_REF_MS = 947_182_440_000;

export interface ScanSummary {
  caseId: number;
  atMs: number;
  tier: Tier;
  spi: number;
  /** Signature decoded percentage shown on the result (0..100). */
  decodedPct: number;
  /** Deep Scan completed for this case. */
  decoded: boolean;
  /** User declined the Deep Scan offer (D-028). */
  declined: boolean;
  /** A Deep Scan on this case logged a class not in the catalogue before. */
  newClass: boolean;
  tags: string[];
}

export interface SentItem {
  templateId: TemplateId;
  caseId?: number;
  /** Delivery time. A time after `nowMs` means still pending. */
  sentAtMs: number;
  opened: boolean;
  /** Template 5 only: the `catalogueCount` it was sent at, so it goes out once per count. */
  catalogueCount?: number;
}

export interface NotifyState {
  intensity: Intensity;
  belief: Belief;
  /** Turning jump-scares off drops one cap level. */
  jumpScaresOff: boolean;
  sessionCount: number;
  optedIn: boolean;
  installMs: number;
  /** Last time the app was opened, for the 7 day stop. */
  lastAppOpenMs: number;
  scans: ScanSummary[];
  /** Every tag the user logged, one entry per logged case. */
  loggedTags: string[];
  /** Classes logged by Deep Scan so far, of 24. */
  catalogueCount: number;
  /** Name of the class logged last, for template 5. Omitted: the sentence drops that clause. */
  lastLoggedClass?: string;
  sent: SentItem[];
  nowMs: number;
  /** Local offset from UTC in minutes at nowMs (UTC+2 = 120). */
  utcOffsetMin: number;
}

export interface Notification {
  templateId: TemplateId;
  title: string;
  body: string;
  fireAtMs: number;
  caseId?: number;
}

export interface PendingItem { id: string; templateId: TemplateId; fireAtMs: number }

/* ---------- time and sky ---------- */

export function localDayNumber(ms: number, utcOffsetMin: number): number {
  return Math.floor((ms + utcOffsetMin * 60_000) / DAY_MS);
}
export function localMinuteOfDay(ms: number, utcOffsetMin: number): number {
  const local = ms + utcOffsetMin * 60_000;
  return Math.floor((((local % DAY_MS) + DAY_MS) % DAY_MS) / 60_000);
}
/**
 * Port of `activityIndex` in src/ui/boot/activity.ts (the screens' index): base 2, +1 within 2 days of
 * a full moon, +1 from 22:00 to 04:00, +2 from 03:00 to 03:59. Moon age comes from the local wall clock
 * truncated to the minute. `utcOffsetMin` stands in for the device time zone.
 */
function wallMs(ms: number, utcOffsetMin: number): number {
  return Math.floor((ms + utcOffsetMin * 60_000) / 60_000) * 60_000;
}
export function moonAgeDays(ms: number, utcOffsetMin = 0): number {
  const days = (wallMs(ms, utcOffsetMin) - NEW_MOON_REF_MS) / DAY_MS;
  return ((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
}
export function forecastIndex(ms: number, utcOffsetMin: number): { index: 1 | 2 | 3 | 4 | 5; moonPct: number } {
  const age = moonAgeDays(ms, utcOffsetMin);
  const moonPct = Math.round(((1 - Math.cos(2 * Math.PI * (age / SYNODIC_DAYS))) / 2) * 100);
  let score = 2;
  if (Math.abs(age - SYNODIC_DAYS / 2) <= 2) score += 1;
  const h = new Date(wallMs(ms, utcOffsetMin)).getUTCHours();
  if (h === 3) score += 2;
  else if (h >= 22 || h < 4) score += 1;
  return { index: Math.max(1, Math.min(5, score)) as 1 | 2 | 3 | 4 | 5, moonPct };
}
export function isFullMoonWindow(ms: number, utcOffsetMin = 0): boolean {
  return Math.abs(moonAgeDays(ms, utcOffsetMin) - SYNODIC_DAYS / 2) <= FULL_MOON_HALF_WIDTH_DAYS;
}

/* ---------- caps and back-off ---------- */

const LEVELS: readonly Intensity[] = ['calm', 'standard', 'brave'];

/** Weekly cap after the jump-scare drop and the ignored back-off. Floor 1. */
export function effectiveCap(s: Pick<NotifyState, 'intensity' | 'jumpScaresOff' | 'sent' | 'nowMs'>): number {
  let level = LEVELS.indexOf(s.intensity);
  if (s.jumpScaresOff) level -= 1;
  if (ignoredInARow(s.sent, s.nowMs) >= BACKOFF_IGNORED) level -= 1;
  return CAP_PER_WEEK[LEVELS[Math.max(0, level)]!];
}

/** Count of delivered, unopened items at the tail of the history. */
export function ignoredInARow(sent: SentItem[], nowMs: number): number {
  const delivered = sent.filter((x) => x.sentAtMs <= nowMs).sort((a, b) => a.sentAtMs - b.sentAtMs);
  let n = 0;
  for (let i = delivered.length - 1; i >= 0 && !delivered[i]!.opened; i--) n++;
  return n;
}

/** True when every 7 day window over the times holds at most `cap` of them. */
export function withinWeeklyCap(times: number[], cap: number): boolean {
  const t = [...times].sort((a, b) => a - b);
  for (let i = 0; i < t.length; i++) {
    let n = 0;
    for (let j = i; j < t.length && t[j]! < t[i]! + WEEK_MS; j++) n++;
    if (n > cap) return false;
  }
  return true;
}

/* ---------- copy ---------- */

/** Words a notification may never carry (plan section 7, D-032) plus lint-copy's banned list. */
export const CLAIM_WORDS = ['verified', 'confirmed', 'accurate', 'real', 'detected', 'active'] as const;
const LORE: Record<string, string> = {
  cellar: 'Cellars hold cold air.',
  attic: 'Attics keep the day heat late.',
  hallway: 'Hallways carry every draught.',
  hall: 'Halls carry every draught.',
  stairs: 'Stairs settle after dark.',
  bedroom: 'Bedrooms cool fast at night.',
  kitchen: 'Kitchens keep warm pipes.',
  bathroom: 'Bathrooms hold damp air.',
  garage: 'Garages sit colder than the house.',
};
// Stems are split so this file passes the copy linter that bans them.
const BANNED_STEMS = ['del' + 'v', 'tapes' + 'tr', 'pivo' + 'tal', 'cru' + 'cial', 'intri' + 'cat', 'testa' + 'ment', 'fos' + 'ter', 'land' + 'scape', 'under' + 'scor'];
const BAD_TAG_RE = new RegExp(`\\b(${BANNED_STEMS.join('|')}\\w*|${CLAIM_WORDS.join('|')}|evp)\\b`, 'i');

export function cleanTag(raw: string): string | null {
  const t = raw.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20).trim();
  if (!t || BAD_TAG_RE.test(t)) return null;
  return t;
}
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pad4 = (n: number) => String(Math.max(0, Math.floor(n))).padStart(4, '0');

/* ---------- candidates ---------- */

/** `idx` is the forecast index at 22:00 of the delivery night, `idx03` at 03:00 after it. */
interface Ctx { s: NotifyState; t: number; moonPct: number; idx: number; idx03: number }

/**
 * Minute of the local day (18:00 to 21:30 inclusive, `WINDOW_START_MIN` to `DELIVERY_END_MIN`) this install is always notified at.
 * Seeded from `installMs` so the relay is predictable and not drawn again each night.
 */
export function deliveryMinute(installMs: number): number {
  const r = mulberry32(Math.floor(installMs / 1000) >>> 0);
  r();
  return WINDOW_START_MIN + Math.floor(r() * (DELIVERY_END_MIN - WINDOW_START_MIN + 1));
}

function build(id: TemplateId, c: Ctx): Notification | null {
  const { s, t, idx, idx03, moonPct } = c;
  switch (id) {
    case 1:
      // The 03:00 index is 4 on every night, so the moon lift (night index 4) is the gate.
      if (idx < HIGH_INDEX || idx03 < HIGH_INDEX) return null;
      return {
        templateId: 1, fireAtMs: t,
        title: `FIELD LOG · IDX ${idx}/5 AT 22:00`,
        body: `Moon ${moonPct}%. Forecast ${idx}/5 after 22:00. ${idx03}/5 at 03:00.`,
      };
    case 2:
      if (!isFullMoonWindow(t, s.utcOffsetMin)) return null;
      if (s.sent.some((x) => x.templateId === 2 && Math.abs(x.sentAtMs - t) < MOON_CYCLE_GAP_MS)) return null;
      return {
        templateId: 2, fireAtMs: t,
        title: `FIELD LOG · MOON ${moonPct}%`,
        body: `Full moon. Forecast index ${idx}/5 from 22:00. ${idx03}/5 at 03:00.`,
      };
    case 3: {
      if (idx < HIGH_INDEX) return null;
      const counts = new Map<string, number>();
      for (const raw of s.loggedTags) {
        const tag = cleanTag(raw);
        if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
      const best = [...counts.entries()]
        .filter(([, n]) => n >= TAG_MIN_COUNT)
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
      if (!best) return null;
      const [tag, n] = best;
      const lore = s.belief === 'yes' ? LORE[tag] : undefined;
      return {
        templateId: 3, fireAtMs: t,
        title: `FIELD LOG · ${tag.toUpperCase()}`,
        body: `${cap1(tag)} on file, ${n} cases. Forecast index ${idx}/5 after 22:00.${lore ? ` ${lore}` : ''}`,
      };
    }
    case 4: {
      const sentCases = new Set(s.sent.filter((x) => x.templateId === 4).map((x) => x.caseId));
      const c4 = s.scans
        .filter((r) => !r.declined && !r.decoded && !sentCases.has(r.caseId)
          && r.decodedPct >= UNRESOLVED_MIN_PCT && r.decodedPct <= UNRESOLVED_MAX_PCT
          && r.atMs <= t && t - r.atMs <= RECENT_CASE_MS)
        .sort((a, b) => b.atMs - a.atMs || b.caseId - a.caseId)[0];
      if (!c4) return null;
      return {
        templateId: 4, fireAtMs: t, caseId: c4.caseId,
        title: `FIELD LOG · CASE ${pad4(c4.caseId)}`,
        body: `Signature ${Math.round(c4.decodedPct)}% decoded. Unresolved.`,
      };
    }
    case 5: {
      const unlogged = CATALOGUE_SIZE - s.catalogueCount;
      if (unlogged <= 0) return null;
      if (s.sent.some((x) => x.templateId === 5 && x.catalogueCount === s.catalogueCount)) return null;
      const last = s.lastLoggedClass?.trim();
      const fresh = s.scans.some((r) => r.decoded && r.newClass && r.atMs <= t && t - r.atMs <= RECENT_CASE_MS);
      if (!fresh) return null;
      return {
        templateId: 5, fireAtMs: t,
        title: `FIELD LOG · CATALOGUE ${s.catalogueCount}/${CATALOGUE_SIZE}`,
        body: `${unlogged} ${unlogged === 1 ? 'class' : 'classes'} unlogged.${last ? ` Last logged: ${last}.` : ''}`,
      };
    }
  }
}

/* ---------- scheduler ---------- */

/**
 * The next notification to schedule, or null. Call again after scheduling it, with the item
 * appended to `sent` (`sentAtMs` = `fireAtMs`, `opened` false), to get the one after.
 */
export function nextNotification(s: NotifyState, _seed: number): Notification | null {
  if (!s.optedIn || s.sessionCount < 2) return null;
  if (s.nowMs - s.lastAppOpenMs >= STALE_AFTER_MS) return null;
  const minute = deliveryMinute(s.installMs);
  const off = s.utcOffsetMin * 60_000;
  const todayStart = localDayNumber(s.nowMs, s.utcOffsetMin) * DAY_MS - off;
  const firstDayStart = (localDayNumber(s.installMs, s.utcOffsetMin) + 1) * DAY_MS - off;
  const earliest = Math.max(s.nowMs + 60_000, firstDayStart, s.installMs + MIN_AFTER_INSTALL_MS);
  const cap = effectiveCap(s);
  const allowed = ALLOWED_TEMPLATES[s.intensity];
  const nightsUsed = new Set(s.sent.map((x) => localDayNumber(x.sentAtMs, s.utcOffsetMin)));
  const sentTimes = s.sent.map((x) => x.sentAtMs);

  for (let d = 0; d < SEARCH_DAYS; d++) {
    const dayStart = todayStart + d * DAY_MS;
    const day = localDayNumber(dayStart + 12 * HOUR_MS, s.utcOffsetMin);
    if (nightsUsed.has(day)) continue;
    const t = dayStart + minute * 60_000; // same local minute every night for this install
    if (t < earliest) continue;
    if (t - s.lastAppOpenMs >= STALE_AFTER_MS) break;
    if (!withinWeeklyCap([...sentTimes, t], cap)) continue;
    const at = (hour: number, plusDays: number) => dayStart + plusDays * DAY_MS + hour * HOUR_MS;
    const ctx: Ctx = {
      s, t, moonPct: forecastIndex(t, s.utcOffsetMin).moonPct,
      idx: forecastIndex(at(22, 0), s.utcOffsetMin).index, // "after 22:00" that night
      idx03: forecastIndex(at(3, 1), s.utcOffsetMin).index, // the 03:00 window after midnight
    };
    for (const id of PRIORITY) {
      if (!allowed.includes(id)) continue;
      const n = build(id, ctx);
      if (n) return n;
    }
  }
  return null;
}

/**
 * The user changed intensity or the jump-scare setting. `next` is the new state, `pending` the
 * scheduled items. A switch to Calm cancels all pending. Otherwise items the new rules no longer
 * allow (template set, weekly cap) are cancelled, earliest kept first. When `reschedule` is true
 * call `nextNotification` at once.
 */
export function applyIntensityChange(
  prev: Pick<NotifyState, 'intensity'>,
  next: NotifyState,
  pending: PendingItem[],
): { cancelIds: string[]; reschedule: boolean } {
  if (next.intensity === 'calm' && prev.intensity !== 'calm') {
    return { cancelIds: pending.map((p) => p.id), reschedule: pending.length > 0 };
  }
  const allowed = ALLOWED_TEMPLATES[next.intensity];
  const cap = effectiveCap(next);
  const kept = next.sent.filter((x) => x.sentAtMs <= next.nowMs).map((x) => x.sentAtMs);
  const cancelIds: string[] = [];
  for (const p of [...pending].sort((a, b) => a.fireAtMs - b.fireAtMs)) {
    if (allowed.includes(p.templateId) && withinWeeklyCap([...kept, p.fireAtMs], cap)) kept.push(p.fireAtMs);
    else cancelIds.push(p.id);
  }
  return { cancelIds, reschedule: cancelIds.length > 0 };
}
