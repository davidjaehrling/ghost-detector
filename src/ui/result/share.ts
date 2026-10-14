import { useCallback, useEffect, useRef, useState } from 'react';
import type { Tier } from '../../engine';
import type { DeepState } from './deepScan';

// Share flow state for the result screen (docs/p6-brief.md 1.5 and 1.6). The copy is final; the
// timing rules live in `useShareOffer`, the render and the system sheet in `runShare`.

export const shareCopy = {
  key: 'SHARE',
  keyLabel: 'Share result',
  cancel: 'CANCEL',
  cancelLabel: 'Cancel',
  ready: (id: string) => `Field card ready. CASE ${id}.`,
  updated: 'Field card updated. Class and EVP added.',
  format: 'Print field card. Format?',
  story: '9:16',
  storySub: 'STORY',
  storyLabel: 'Print as 9 by 16',
  square: '1:1',
  squareSub: 'SQUARE',
  squareLabel: 'Print as 1 by 1',
  printing: 'PRINTING FIELD CARD. STAND BY.',
  fault: 'E-31 PRINTER FAULT. CARD NOT SAVED.',
  title: (id: string) => `Send field card · CASE ${id}`,
};

export type ShareMode = 'idle' | 'format' | 'printing' | 'fault';
export type OfferKind = 'ready' | 'updated';

/** Offered proactively only here; QUIET and TRACE keep a working key and no line. */
export const OFFER_TIERS: readonly Tier[] = ['active', 'strong', 'critical'];
/** The line comes 3.0 s after the reveal settles, and 3.0 s after a rewarded ad closes. */
export const OFFER_DELAY_MS = 3000;
/** How long the line stays before the result line returns. */
export const OFFER_LIFE_MS = 8000;
/** The faded-in time of the high-resolution figure after a Deep Scan (the compositor's fade). */
export const HIRES_SETTLE_MS = 1500;
/** The fault line stays this long. */
export const FAULT_LIFE_MS = 4000;

/**
 * Wall-clock time the line is due. `ready`: 3.0 s after the reveal settled. `updated`: 3.0 s after the
 * high-resolution figure has faded in. Either waits until 3.0 s after the last rewarded ad closed.
 */
export function offerDueAt(kind: OfferKind, t: { stableAt: number; unlockAt: number | null; closedAt: number | null }): number {
  const base = kind === 'updated' && t.unlockAt !== null ? t.unlockAt + HIRES_SETTLE_MS : t.stableAt;
  return Math.max(base + OFFER_DELAY_MS, t.closedAt === null ? 0 : t.closedAt + OFFER_DELAY_MS);
}

export type OfferInput = {
  tier: Tier;
  /** The needle is at rest, the figure has faded in and the scare is over. */
  stable: boolean;
  deep: DeepState;
  /** When the last rewarded ad closed, wall ms; null before one has. */
  adClosedAt: number | null;
  /** Harness: `?static=1` freezes the timers unless the page asks for `share=timer`. */
  frozen: boolean;
  /** Harness: `share=offer` and `share=updated` start with the line up. */
  initial: OfferKind | null;
};

/**
 * When the proactive line shows. One `ready` line per result, one `updated` line after a Deep Scan
 * finishes on this screen. It waits while a rewarded ad loads or plays and for 3.0 s after it closes.
 */
export function useShareOffer(o: OfferInput) {
  const { tier, stable, deep, adClosedAt, frozen, initial } = o;
  const wide = OFFER_TIERS.includes(tier);
  // `at` is when the line went up; a line from before the last rewarded ad closed is never shown again.
  const [up, setUp] = useState<{ kind: OfferKind; at: number } | null>(initial ? { kind: initial, at: Infinity } : null);
  const r = useRef<{
    stableAt: number | null;
    unlockAt: number | null;
    prev: DeepState | undefined;
    done: Record<OfferKind, boolean>;
  }>({ stableAt: null, unlockAt: null, prev: undefined, done: { ready: false, updated: false } });

  useEffect(() => {
    const st = r.current;
    const now = Date.now();
    if (st.prev !== undefined && st.prev !== 'unlocked' && deep === 'unlocked') st.unlockAt = now;
    st.prev = deep;
    if (stable && st.stableAt === null) st.stableAt = now;
    if (frozen || !wide || !stable) return;
    // A rewarded ad is loading or playing: no line, and any line already up goes.
    if (deep === 'running' || deep === 'warming') {
      return;
    }
    const kind: OfferKind = st.unlockAt !== null ? 'updated' : 'ready';
    // A line that an ad took off the screen did not count: it is offered again, clear of the ad.
    const taken = up !== null && adClosedAt !== null && up.at < adClosedAt && up.kind === kind;
    if (st.done[kind] && !taken) return;
    const at = offerDueAt(kind, { stableAt: st.stableAt!, unlockAt: st.unlockAt, closedAt: adClosedAt });
    const timer = setTimeout(() => {
      st.done.ready = true;
      if (kind === 'updated') st.done.updated = true;
      setUp({ kind, at: Date.now() });
    }, Math.max(0, at - now));
    return () => clearTimeout(timer);
  }, [stable, deep, wide, frozen, adClosedAt, up]);

  // The line goes after its life; the harness (`frozen`) keeps it up for the golden.
  useEffect(() => {
    if (up === null || frozen || initial !== null) return;
    const timer = setTimeout(() => setUp(null), OFFER_LIFE_MS);
    return () => clearTimeout(timer);
  }, [up, frozen, initial]);

  const dismiss = useCallback(() => setUp(null), []);
  const busy = deep === 'running' || deep === 'warming';
  const stale = up !== null && adClosedAt !== null && up.at < adClosedAt;
  return { line: up === null || stale || (busy && !frozen) ? null : up.kind, dismiss };
}
