import { useEffect, useState } from 'react';
import { msToNextMinute } from './activity';

// The wall clock at minute resolution: `initial` until the next whole minute, then a fresh read
// once a minute. With `fixed` (the harness) it never moves.
export function useMinuteClock(initial: Date, fixed: boolean): Date {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    if (fixed) return;
    let id: ReturnType<typeof setTimeout>;
    const arm = () => {
      id = setTimeout(() => {
        setNow(new Date());
        arm();
      }, msToNextMinute(new Date()));
    };
    arm();
    return () => clearTimeout(id);
  }, [fixed]);
  return now;
}
