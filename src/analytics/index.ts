import { analyticsAllowed } from '../ads';
import { type Backend, type EventParams, backend } from './backend';

// Analytics facade (P5-07). Three rules, all enforced here and nowhere else:
//   1. Nothing is sent unless analyticsAllowed() (NOT_REQUIRED, or OBTAINED with TCF Purpose 1).
//   2. Only the events below, with only the param keys listed for them. Unknown events and unknown
//      keys are dropped.
//   3. Param values are numbers or short lowercase enum strings from a fixed set. No free text.

const TIERS = ['quiet', 'trace', 'active', 'strong', 'critical'] as const;
const INTENSITIES = ['calm', 'standard', 'brave'] as const;
const CONSENT = ['notRequired', 'obtained'] as const;
/** Fault codes the FAULT screen can show (docs: E-52 optics offline, E-60 route fault). */
export const FAULT_CODES = ['E-52', 'E-60'] as const;

type ParamSpec = readonly string[] | 'number';

/** The allowlist. Add an event or a key here and in the acceptance text together. */
export const ALLOWLIST = {
  // `status` is the one key beyond the acceptance wording: it fires only when allowed, so it can
  // only be one of these two values. Flagged to Compliance.
  consent_status: { status: CONSENT },
  scan_complete: { tier: TIERS, intensity: INTENSITIES },
  deep_scan_offered: {},
  deep_scan_rewarded: {},
  interstitial_shown: {},
  share_card: {},
  // The code only: no message, no stack, no route.
  fault: { code: FAULT_CODES },
} as const satisfies Record<string, Record<string, ParamSpec>>;

export type AnalyticsEvent = keyof typeof ALLOWLIST;
export type ScanCompleteParams = { tier: (typeof TIERS)[number]; intensity: (typeof INTENSITIES)[number] };
export type FaultParams = { code: (typeof FAULT_CODES)[number] };
export type ConsentStatusParams = { status: (typeof CONSENT)[number] };

type Allowed = Record<string, ParamSpec>;

/** Keep only listed keys whose value fits the spec. Returns null when the event is not on the list. */
export function sanitize(event: string, params: Record<string, unknown> = {}): EventParams | null {
  if (!Object.hasOwn(ALLOWLIST, event)) return null;
  const spec = ALLOWLIST[event as AnalyticsEvent] as Allowed;
  const out: EventParams = {};
  for (const key of Object.keys(params)) {
    if (!Object.hasOwn(spec, key)) continue;
    const v = params[key];
    const rule = spec[key]!;
    if (rule === 'number' ? typeof v === 'number' && Number.isFinite(v) : typeof v === 'string' && rule.includes(v)) out[key] = v as string | number;
  }
  return out;
}

export function createAnalytics(be: Backend, allowed: () => boolean) {
  let enabled = false;
  return {
    track(event: string, params?: Record<string, unknown>): void {
      const clean = sanitize(event, params);
      if (!clean) return;
      if (!allowed()) {
        if (enabled) {
          enabled = false;
          be.setEnabled(false);
        }
        return;
      }
      if (!enabled) {
        enabled = true;
        be.setEnabled(true);
      }
      be.logEvent(event, clean);
    },
  };
}

const analytics = createAnalytics(backend, analyticsAllowed);

export function track(event: 'scan_complete', params: ScanCompleteParams): void;
export function track(event: 'consent_status', params: ConsentStatusParams): void;
export function track(event: 'fault', params: FaultParams): void;
export function track(event: Exclude<AnalyticsEvent, 'scan_complete' | 'consent_status' | 'fault'>, params?: Record<string, never>): void;
export function track(event: string, params?: Record<string, unknown>): void {
  analytics.track(event, params);
}
