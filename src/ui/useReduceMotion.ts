import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// OS reduced-motion setting (Bible section 7). False until the platform answers, and when it cannot.
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (v) => live && setReduce(v),
      () => {},
    );
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => live && setReduce(v));
    return () => {
      live = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}
