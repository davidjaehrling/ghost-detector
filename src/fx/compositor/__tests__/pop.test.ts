import { describe, expect, it } from 'vitest';

import { CLAMP_LIFT, POP_ALPHA, POP_LIFT } from '../blend';

// Pinned values: the pop frame's look (D-017) and the clamp the measurement script checks.
describe('compositor constants', () => {
  it('raises the pop frame to a 40% peak alpha, inside the 35 to 45% band', () => {
    expect(POP_ALPHA).toBe(0.4);
    expect(POP_ALPHA).toBeGreaterThanOrEqual(0.35);
    expect(POP_ALPHA).toBeLessThanOrEqual(0.45);
  });

  it('opens the clamp by 40 luma on the pop frame', () => {
    expect(POP_LIFT).toBe(40);
  });

  it('keeps the steady clamp at 34 luma above the reference', () => {
    expect(CLAMP_LIFT).toBe(34);
  });
});
