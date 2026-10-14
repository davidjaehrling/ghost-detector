import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { setGate } from './interstitial';

/**
 * Viewfinder only. `clear` is true when the camera permission is settled (not being asked). The
 * gate is open only while the screen is focused and mounted and the permission is clear.
 */
export function useInterstitialGate(clear: boolean): void {
  useFocusEffect(
    useCallback(() => {
      if (!clear) return;
      // Two frames after the commit, so the viewfinder has been drawn at least once.
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setGate(true)));
      return () => {
        cancelAnimationFrame(raf);
        setGate(false);
      };
    }, [clear]),
  );
}
