import { describe, expect, it } from 'vitest';
import { DIAL_H, DIAL_R, DIAL_W, PLATE_INSET, labelBoxes, nearestToPivot } from '../dialLabels';

describe('EMF dial labels', () => {
  it('sit outside the tick ring and inside the plate', () => {
    for (const b of labelBoxes()) {
      expect(nearestToPivot(b)).toBeGreaterThanOrEqual(DIAL_R + 1);
      expect(b.left).toBeGreaterThanOrEqual(PLATE_INSET);
      expect(b.left + b.width).toBeLessThanOrEqual(DIAL_W - PLATE_INSET);
      expect(b.top).toBeGreaterThanOrEqual(0);
      expect(b.top + b.height).toBeLessThanOrEqual(DIAL_H);
    }
  });
  it('2000 is inset 6 px from the right edge', () => {
    const b = labelBoxes().find((l) => l.mg === 2000)!;
    expect(DIAL_W - (b.left + b.width)).toBeGreaterThanOrEqual(6);
  });
});
