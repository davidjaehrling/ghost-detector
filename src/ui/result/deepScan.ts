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

/** Per process: a scan whose ad was dismissed without the reward is not offered again. */
const declined = new Set<string>();
export function resetDeepScanSession(): void {
  declined.clear();
}

export function useDeepScan(opts: { id: string; enabled: boolean; unlockedAt: number | undefined; persist: boolean }) {
  const { id, enabled, unlockedAt, persist } = opts;
  const consent = useConsent();
  const status = useSyncExternalStore(rewarded.subscribe, rewarded.status, rewarded.status);
  const [unlocked, setUnlocked] = useState(unlockedAt !== undefined);
  const [running, setRunning] = useState(false);
  const [dismissed, setDismissed] = useState(() => declined.has(id));
  const offered = useRef(false);
  const eligible = enabled && !unlocked && !dismissed;

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
  else if (dismissed) state = 'ready';
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
    // Dismissed without the reward: the key stays, and nothing else is asked in this session.
    if (dismissed) return;
    setRunning(true);
    const result = await rewarded.show();
    setRunning(false);
    if (result.shown) onRewardedShown();
    if (result.earned) {
      if (persist) unlockDeepScan(id);
      track('deep_scan_rewarded');
      setUnlocked(true);
    } else if (result.shown) {
      declined.add(id);
      setDismissed(true);
    }
  };

  return { state, press };
}
