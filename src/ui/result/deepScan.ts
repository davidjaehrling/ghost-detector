import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { canRequestAds, ensureConsent, rewarded } from '../../ads';
import { track } from '../../analytics';
import { unlockDeepScan } from '../../state/scans';
import { useConsent } from '../../state/useConsent';
import { onRewardedShown } from '../interstitial';

export type DeepState =
  /** Ad loaded and consent allows: the key is live. */
  | 'ready'
  /** Consent not yet answered, or the ad is still loading. */
  | 'warming'
  /** No consent to request, or the load failed. */
  | 'offline'
  /** The ad is on screen. */
  | 'running'
  /** Reward earned and stored on the scan. */
  | 'unlocked';

export function useDeepScan(opts: { id: string; enabled: boolean; unlockedAt: number | undefined; persist: boolean }) {
  const { id, enabled, unlockedAt, persist } = opts;
  const consent = useConsent();
  const status = useSyncExternalStore(rewarded.subscribe, rewarded.status, rewarded.status);
  const [unlocked, setUnlocked] = useState(unlockedAt !== undefined);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const offered = useRef(false);
  const eligible = enabled && !unlocked && !failed;

  // Preload when the result mounts, only with consent to request.
  useEffect(() => {
    if (!eligible) return;
    let alive = true;
    void ensureConsent().then(() => {
      if (alive && canRequestAds()) void rewarded.load();
    });
    return () => {
      alive = false;
    };
  }, [eligible, id]);

  const requestable = consent.canRequestAds && canRequestAds();
  let state: DeepState;
  if (unlocked) state = 'unlocked';
  else if (running) state = 'running';
  else if (failed) state = 'offline';
  else if (!enabled) state = 'offline';
  else if (!requestable) state = consent.status === 'unknown' ? 'warming' : 'offline';
  else if (status === 'ready') state = 'ready';
  else if (status === 'failed') state = 'offline';
  else state = 'warming';

  // The enabled key appears: count it once per result screen.
  useEffect(() => {
    if (state === 'ready' && !offered.current) {
      offered.current = true;
      track('deep_scan_offered');
    }
  }, [state]);

  const press = async () => {
    if (state !== 'ready' || running) return;
    setRunning(true);
    const result = await rewarded.show();
    setRunning(false);
    if (!result.shown) {
      // The ad did not appear: the key goes offline rather than looking live while doing nothing.
      setFailed(true);
      return;
    }
    onRewardedShown();
    if (result.earned) {
      if (persist) unlockDeepScan(id);
      track('deep_scan_rewarded');
      setUnlocked(true);
    } else {
      // Dismissed without the reward: the slot is spent, so the key warms while a fresh ad loads.
      // A second tap, user initiated, plays it.
      void rewarded.load();
    }
  };

  return { state, press };
}
