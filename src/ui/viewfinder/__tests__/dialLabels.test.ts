import { describe, expect, it } from 'vitest';
import { DIAL_H, DIAL_R, DIAL_W, GEO_LABEL, PIVOT, PLATE_INSET, labelBoxes, nearestToPivot } from '../dialLabels';
import { fluxAngle } from '../flux';

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

  it('no two scale labels overlap (1000 and 2000 used to touch)', () => {
    const boxes = labelBoxes();
    for (const a of boxes) {
      for (const b of boxes) {
        if (a.mg >= b.mg) continue;
        const apartX = a.left + a.width <= b.left || b.left + b.width <= a.left;
        const apartY = a.top + a.height <= b.top || b.top + b.height <= a.top;
        expect(apartX || apartY, `${a.mg} and ${b.mg}`).toBe(true);
      }
    }
  });

  it('the GEO label sits inside the tick ring and clear of the needle path from 200 to 1000 mG', () => {
    const { left, top, width } = GEO_LABEL;
    const box = { left, top, right: left + width, bottom: top + 12 };
    // Nearest corner to the pivot is inside the ring (the labels are outside it).
    const near = Math.hypot(Math.max(box.left - PIVOT.x, 0), Math.max(PIVOT.y - box.bottom, 0));
    expect(near).toBeLessThan(DIAL_R);
    expect(box.right).toBeLessThanOrEqual(DIAL_W - PLATE_INSET);
    // The hand (3 px with its 2 px shadow offset) at both ends of the path never enters the box.
    for (const mg of [200, 1000]) {
      const a = (fluxAngle(mg) * Math.PI) / 180;
      for (let r = 0; r <= DIAL_R - 4; r += 1) {
        const x = PIVOT.x + r * Math.sin(a) + 3.5;
        const y = PIVOT.y - r * Math.cos(a) + 2;
        const inside = x > box.left && x < box.right && y > box.top && y < box.bottom;
        expect(inside, `${mg} mG at radius ${r}`).toBe(false);
      }
    }
    // The needle at any angle between the two never crosses it either: the path's right edge is 1000 mG.
    expect(fluxAngle(1000)).toBeLessThan(40);
  });
});
