import { type Activity, activityIndex } from '../ui/boot/activity';

// One activity index per app session (D-011): boot reads it first and the viewfinder shows the
// same number, even when the clock crosses an hour in between. The first caller fixes it; a
// direct visit to the viewfinder (no boot) fixes it there.
let current: Activity | null = null;

export function sessionActivity(now: Date = new Date()): Activity {
  current ??= activityIndex(now);
  return current;
}

// Test hook, and a fresh session after a cold start.
export function resetSessionActivity(): void {
  current = null;
}
