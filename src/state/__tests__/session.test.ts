import { beforeEach, describe, expect, it } from 'vitest';
import { resetSessionActivity, sessionActivity } from '../session';

describe('session activity index', () => {
  beforeEach(resetSessionActivity);

  it('is fixed by the first caller and shared afterwards', () => {
    const boot = sessionActivity(new Date(2026, 9, 13, 22, 48));
    expect(boot.index).toBe(3);
    // An hour later (03:xx scores higher) the viewfinder still shows the boot's number.
    expect(sessionActivity(new Date(2026, 9, 14, 3, 30))).toBe(boot);
  });

  it('starts over after a reset', () => {
    sessionActivity(new Date(2026, 9, 13, 22, 48));
    resetSessionActivity();
    expect(sessionActivity(new Date(2026, 9, 14, 3, 30)).index).toBe(4);
  });
});
