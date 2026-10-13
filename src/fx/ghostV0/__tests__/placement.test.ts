import { describe, expect, it } from 'vitest';
import { TIERS, mulberry32 } from '../../../engine';
import {
  CENTRE_EXCLUSION,
  COPY_ALPHA_SUM,
  DEFAULT_OPACITY_RANGE,
  EDGE_MARGIN_X,
  EDGE_MARGIN_Y,
  FALLBACK_LIFT,
  ECHO_ALPHA,
  ECHO_PX,
  ECHO_SHARE,
  MAX_AREA_FRACTION,
  OPACITY_MAX,
  OPACITY_MIN,
  TIER_EXTENT,
  TIER_OPACITY_CAP,
  ghostTint,
  stackedAlpha,
  placeGhost,
  type Placement,
  type RegionInput,
} from '../placement';

const FRAMES = [
  { w: 1080, h: 1920 },
  { w: 1920, h: 1080 },
  { w: 390, h: 844 },
  { w: 512, h: 512 },
];

function union(p: Placement) {
  const dx = [...p.offsetCopies.map((c) => c.dx), p.echo?.dx ?? 0];
  const dy = [...p.offsetCopies.map((c) => c.dy), p.echo?.dy ?? 0];
  const x0 = p.x + Math.min(0, ...dx);
  const x1 = p.x + p.w + Math.max(0, ...dx);
  const y0 = p.y + Math.min(0, ...dy);
  const y1 = p.y + p.h + Math.max(0, ...dy);
  return { x0, x1, y0, y1, area: (x1 - x0) * (y1 - y0) };
}

function randomRegion(rnd: () => number): RegionInput {
  const w = 0.1 + rnd() * 0.6;
  const h = 0.1 + rnd() * 0.6;
  const x = rnd() * (1 - w);
  const y = rnd() * (1 - h);
  return { x, y, w, h, cx: x + w * (0.3 + rnd() * 0.4), cy: y + h * (0.3 + rnd() * 0.4), areaFraction: w * h * 0.7 };
}

// 4 frames x 500 seeds, half of them with a null region.
const CASES: { frame: (typeof FRAMES)[number]; region: RegionInput | null; seed: number }[] = [];
{
  const rnd = mulberry32(42);
  for (const frame of FRAMES) {
    for (let s = 0; s < 500; s++) {
      CASES.push({ frame, region: s % 2 ? randomRegion(rnd) : null, seed: (rnd() * 2 ** 32) >>> 0 });
    }
  }
}

describe('placeGhost', () => {
  it('keeps the figure and its copies at or under 15% of the frame', () => {
    for (const { frame, region, seed } of CASES) {
      const p = placeGhost(region, frame, seed);
      expect(union(p).area / (frame.w * frame.h)).toBeLessThanOrEqual(MAX_AREA_FRACTION);
    }
  });

  it('keeps the figure and its copies inside the frame', () => {
    for (const { frame, region, seed } of CASES) {
      const u = union(placeGhost(region, frame, seed));
      expect(u.x0).toBeGreaterThanOrEqual(-1e-6);
      expect(u.y0).toBeGreaterThanOrEqual(-1e-6);
      expect(u.x1).toBeLessThanOrEqual(frame.w + 1e-6);
      expect(u.y1).toBeLessThanOrEqual(frame.h + 1e-6);
    }
  });

  it('never centres the figure in the frame', () => {
    for (const { frame, region, seed } of CASES) {
      const p = placeGhost(region, frame, seed);
      expect(Math.abs(p.x + p.w / 2 - frame.w / 2)).toBeGreaterThanOrEqual(CENTRE_EXCLUSION * frame.w);
    }
  });

  it('even for a region dead centre in the frame', () => {
    const region = { x: 0.3, y: 0.3, w: 0.4, h: 0.4, cx: 0.5, cy: 0.5, areaFraction: 0.16 };
    for (let seed = 0; seed < 200; seed++) {
      const p = placeGhost(region, { w: 1080, h: 1920 }, seed);
      expect(Math.abs(p.x + p.w / 2 - 540)).toBeGreaterThanOrEqual(CENTRE_EXCLUSION * 1080);
    }
  });

  it('sits inside the region, off its centroid', () => {
    const frame = { w: 1080, h: 1920 };
    const region = { x: 0.05, y: 0.4, w: 0.35, h: 0.45, cx: 0.22, cy: 0.62, areaFraction: 0.12 };
    for (let seed = 0; seed < 200; seed++) {
      const p = placeGhost(region, frame, seed);
      const fx = (p.x + p.w / 2) / frame.w;
      const fy = (p.y + p.h / 2) / frame.h;
      expect(fx).toBeGreaterThanOrEqual(region.x - 1e-9);
      expect(fx).toBeLessThanOrEqual(region.x + region.w + 1e-9);
      expect(fy).toBeGreaterThanOrEqual(region.y - 1e-9);
      expect(fy).toBeLessThanOrEqual(region.y + region.h + 1e-9);
      // Offset is 10 to 30% of the region size on each axis.
      const ox = Math.abs(fx - region.cx) / region.w;
      const oy = Math.abs(fy - region.cy) / region.h;
      expect(ox).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(ox).toBeLessThanOrEqual(0.3 + 1e-9);
      expect(oy).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(oy).toBeLessThanOrEqual(0.3 + 1e-9);
    }
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const region = CASES[1]!.region;
    const a = placeGhost(region, FRAMES[0]!, 1234);
    expect(placeGhost(region, FRAMES[0]!, 1234)).toEqual(a);
    const distinct = new Set<string>();
    for (let s = 0; s < 30; s++) distinct.add(JSON.stringify(placeGhost(region, FRAMES[0]!, s)));
    expect(distinct.size).toBe(30);
  });

  it('falls back to an off-centre lower-third placement with no region', () => {
    const left = { n: 0 };
    for (let seed = 0; seed < 300; seed++) {
      for (const frame of FRAMES) {
        const p = placeGhost(null, frame, seed);
        expect(p.y + p.h).toBeGreaterThanOrEqual((frame.h * 2) / 3);
        expect(p.y + p.h / 2).toBeGreaterThan(frame.h / 2);
        if (p.x + p.w / 2 < frame.w / 2) left.n++;
      }
    }
    // Both sides get used.
    expect(left.n).toBeGreaterThan(300);
    expect(left.n).toBeLessThan(900);
  });

  it('keeps opacity in band, uses all three mattes, 3 to 5 copies at falling alpha', () => {
    const mattes = new Set<number>();
    for (const { frame, region, seed } of CASES) {
      const p = placeGhost(region, frame, seed);
      mattes.add(p.matte);
      expect(p.opacity).toBeGreaterThanOrEqual(OPACITY_MIN);
      expect(p.opacity).toBeLessThanOrEqual(OPACITY_MAX);
      expect(p.offsetCopies.length).toBeGreaterThanOrEqual(3);
      expect(p.offsetCopies.length).toBeLessThanOrEqual(5);
      for (let i = 1; i < p.offsetCopies.length; i++) {
        expect(p.offsetCopies[i]!.alpha).toBeLessThan(p.offsetCopies[i - 1]!.alpha);
      }
    }
    expect([...mattes].sort()).toEqual([1, 2, 3]);
  });

  it('honours a narrower opacity band and clamps a wider one', () => {
    for (let seed = 0; seed < 100; seed++) {
      const p = placeGhost(null, FRAMES[0]!, seed, { opacityRange: [0.11, 0.18] });
      expect(p.opacity).toBeGreaterThanOrEqual(0.11);
      expect(p.opacity).toBeLessThanOrEqual(0.18);
      const q = placeGhost(null, FRAMES[0]!, seed, { opacityRange: [0, 0.9] });
      expect(q.opacity).toBeGreaterThanOrEqual(OPACITY_MIN);
      expect(q.opacity).toBeLessThanOrEqual(OPACITY_MAX);
    }
  });
});

describe('copy alpha cap (Refuter D4)', () => {
  it('copies sum to COPY_ALPHA_SUM, so the stacked alpha stays <= opacity x 1.35 <= 0.3375', () => {
    for (const { frame, region, seed } of CASES) {
      const p = placeGhost(region, frame, seed);
      const sum = p.offsetCopies.reduce((a, c) => a + c.alpha, 0);
      expect(sum).toBeCloseTo(COPY_ALPHA_SUM, 9);
      const a = stackedAlpha(p);
      expect(a).toBeLessThanOrEqual(p.opacity * (1 + COPY_ALPHA_SUM) + 1e-12);
      expect(a).toBeLessThanOrEqual(OPACITY_MAX * (1 + COPY_ALPHA_SUM) + 1e-12);
      expect(a).toBeGreaterThan(p.opacity);
    }
  });
});

describe('ghostTint (fallback)', () => {
  it('is neutral grey at p90 + FALLBACK_LIFT, clamped', () => {
    for (const p90 of [0, 12, 40, 90, 200, 237, 250, 255]) {
      const t = ghostTint(p90);
      expect(t.hex).toMatch(/^#([0-9a-f]{2})\1\1$/);
      expect(t.luma).toBe(Math.min(255, p90 + FALLBACK_LIFT));
      expect(parseInt(t.hex.slice(1, 3), 16)).toBe(t.luma);
    }
    expect(ghostTint(Number.NaN).luma).toBe(60 + FALLBACK_LIFT);
    expect(ghostTint(-20).luma).toBe(FALLBACK_LIFT);
  });
});

// Shapes like the regions the fixtures produce (D-009): flush left, flush right, centred low,
// a top band, and no region at all.
const FIXTURE_REGIONS: (RegionInput | null)[] = [
  { x: 0, y: 0.18, w: 0.3, h: 0.62, cx: 0.11, cy: 0.5, areaFraction: 0.15 },
  { x: 0.7, y: 0.25, w: 0.3, h: 0.55, cx: 0.88, cy: 0.52, areaFraction: 0.13 },
  { x: 0.3, y: 0.6, w: 0.42, h: 0.38, cx: 0.5, cy: 0.8, areaFraction: 0.12 },
  { x: 0.04, y: 0, w: 0.92, h: 0.26, cx: 0.45, cy: 0.1, areaFraction: 0.2 },
  null,
];
const PANEL_FRAMES = [{ w: 390, h: 360 }, { w: 390, h: 844 }, { w: 1080, h: 1920 }, { w: 1920, h: 1080 }, { w: 360, h: 300 }];

describe('placement margins (D-009)', () => {
  // 5 regions x 400 seeds = 2000 placements, frames cycled.
  const rnd = mulberry32(2009);
  const cases = FIXTURE_REGIONS.flatMap((region, r) =>
    Array.from({ length: 400 }, (_, i) => ({ region, frame: PANEL_FRAMES[(i + r) % PANEL_FRAMES.length]!, seed: (rnd() * 2 ** 32) >>> 0 })),
  );

  it('keeps the centre 15 to 40% in from a side edge, 10% from top and bottom, off the midline', () => {
    expect(cases).toHaveLength(2000);
    for (const { region, frame, seed } of cases) {
      for (const tier of [undefined, 'active', 'critical'] as const) {
        const p = placeGhost(region, frame, seed, tier ? { tier } : {});
        const fx = (p.x + p.w / 2) / frame.w;
        const fy = (p.y + p.h / 2) / frame.h;
        const inset = Math.min(fx, 1 - fx);
        expect(inset).toBeGreaterThanOrEqual(EDGE_MARGIN_X[0] - 1e-9);
        expect(inset).toBeLessThanOrEqual(EDGE_MARGIN_X[1] + 1e-9);
        expect(fy).toBeGreaterThanOrEqual(EDGE_MARGIN_Y - 1e-9);
        expect(fy).toBeLessThanOrEqual(1 - EDGE_MARGIN_Y + 1e-9);
        expect(Math.abs(fx - 0.5)).toBeGreaterThanOrEqual(CENTRE_EXCLUSION);
        const u = union(p);
        expect(u.x0).toBeGreaterThanOrEqual(-1e-6);
        expect(u.x1).toBeLessThanOrEqual(frame.w + 1e-6);
        expect(u.y0).toBeGreaterThanOrEqual(-1e-6);
        expect(u.y1).toBeLessThanOrEqual(frame.h + 1e-6);
        expect(u.area / (frame.w * frame.h)).toBeLessThanOrEqual(MAX_AREA_FRACTION);
      }
    }
  });

  it('overlaps the region, and slides to the inner side of a region flush with an edge', () => {
    for (const { region, frame, seed } of cases) {
      if (!region) continue;
      const p = placeGhost(region, frame, seed);
      const u = union(p);
      // The figure box overlaps the region box.
      expect(p.x).toBeLessThan((region.x + region.w) * frame.w);
      expect(p.x + p.w).toBeGreaterThan(region.x * frame.w);
      expect(p.y).toBeLessThan((region.y + region.h) * frame.h);
      expect(p.y + p.h).toBeGreaterThan(region.y * frame.h);
      expect(u.area).toBeGreaterThan(0);
      const fx = (p.x + p.w / 2) / frame.w;
      if (region.x === 0) expect(fx).toBeGreaterThan(region.cx);
      if (region.x + region.w === 1) expect(fx).toBeLessThan(region.cx);
    }
  });
});

describe('tier caps (D-009)', () => {
  it('caps opacity by tier when a tier is given, and leaves it alone without one', () => {
    let aboveCritical = 0;
    for (let seed = 0; seed < 500; seed++) {
      for (const tier of TIERS) {
        const p = placeGhost(null, FRAMES[2]!, seed, { tier, opacityRange: [0.08, 0.25] });
        expect(p.opacity).toBeLessThanOrEqual(TIER_OPACITY_CAP[tier] + 1e-12);
        expect(p.opacity).toBeGreaterThanOrEqual(OPACITY_MIN);
      }
      if (placeGhost(null, FRAMES[2]!, seed).opacity > TIER_OPACITY_CAP.critical) aboveCritical++;
      const custom = placeGhost(null, FRAMES[2]!, seed, { tier: 'active', tierCap: { active: 0.12 } });
      expect(custom.opacity).toBeLessThanOrEqual(0.12);
    }
    expect(aboveCritical).toBeGreaterThan(0);
  });

  it('keeps a belief band under the cap: [0.14, 0.22] on CRITICAL becomes [0.14, 0.18]', () => {
    for (let seed = 0; seed < 200; seed++) {
      const p = placeGhost(null, FRAMES[0]!, seed, { tier: 'critical', opacityRange: [0.14, 0.22] });
      expect(p.opacity).toBeGreaterThanOrEqual(0.14);
      expect(p.opacity).toBeLessThanOrEqual(0.18);
    }
  });

  it('drops one motion copy on CRITICAL', () => {
    for (let seed = 0; seed < 300; seed++) {
      const base = placeGhost(null, FRAMES[0]!, seed);
      const crit = placeGhost(null, FRAMES[0]!, seed, { tier: 'critical' });
      expect(crit.offsetCopies.length).toBe(base.offsetCopies.length - 1);
      // The echo takes ECHO_SHARE out of the copies' budget; the stacked alpha keeps its bound.
      expect(crit.offsetCopies.reduce((a, c) => a + c.alpha, 0) + ECHO_SHARE).toBeCloseTo(COPY_ALPHA_SUM, 9);
      expect(stackedAlpha(crit)).toBeLessThanOrEqual(crit.opacity * (1 + COPY_ALPHA_SUM - ECHO_SHARE + ECHO_ALPHA) + 1e-12);
      expect(stackedAlpha(crit)).toBeLessThanOrEqual(0.3);
      expect(placeGhost(null, FRAMES[0]!, seed, { tier: 'active' }).offsetCopies.length).toBe(base.offsetCopies.length);
    }
  });
});

describe('tier extent and the CRITICAL echo (D-017)', () => {
  it('escalates the covered share ACTIVE < STRONG < CRITICAL, at the tier targets and never over 15%', () => {
    for (const { frame, region, seed } of CASES.slice(0, 600)) {
      const share = (tier: 'active' | 'strong' | 'critical') => union(placeGhost(region, frame, seed, { tier })).area / (frame.w * frame.h);
      const a = share('active');
      const st = share('strong');
      const c = share('critical');
      expect(a).toBeLessThan(st);
      expect(st).toBeLessThan(c);
      expect(c).toBeLessThanOrEqual(MAX_AREA_FRACTION);
      // At the target unless the frame is too narrow for it (width cap of 75%).
      if (frame.w >= frame.h * 0.6) {
        expect(a).toBeCloseTo(TIER_EXTENT.active!, 2);
        expect(st).toBeCloseTo(TIER_EXTENT.strong!, 2);
        expect(c).toBeCloseTo(TIER_EXTENT.critical!, 2);
      }
    }
  });

  it('adds exactly one echo 8 to 12 px off the figure at 45% of its alpha, on CRITICAL only (D-022)', () => {
    expect(ECHO_PX).toEqual([8, 12]);
    expect(ECHO_ALPHA).toBe(0.45);
    const dirs = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      const crit = placeGhost(null, FRAMES[2]!, seed, { tier: 'critical' });
      // One echo next to the motion copies (2 to 4 on CRITICAL); none of them is as strong.
      expect(crit.echo).toBeDefined();
      expect(crit.offsetCopies.length).toBeGreaterThanOrEqual(2);
      expect(crit.offsetCopies.length).toBeLessThanOrEqual(4);
      for (const c of crit.offsetCopies) expect(c.alpha).toBeLessThan(crit.echo!.alpha);
      const d = Math.hypot(crit.echo!.dx, crit.echo!.dy);
      expect(d).toBeGreaterThanOrEqual(ECHO_PX[0] - 1e-9);
      expect(d).toBeLessThanOrEqual(ECHO_PX[1] + 1e-9);
      // Alpha ratio to the main figure (Placement.opacity is the main figure's alpha).
      expect(crit.echo!.alpha).toBe(ECHO_ALPHA);
      dirs.add(`${Math.sign(crit.echo!.dx)}`);
      for (const tier of ['quiet', 'trace', 'active', 'strong'] as const) expect(placeGhost(null, FRAMES[2]!, seed, { tier }).echo).toBeUndefined();
      expect(placeGhost(null, FRAMES[2]!, seed).echo).toBeUndefined();
    }
    // The direction is seeded: both sides occur.
    expect(dirs).toEqual(new Set(['1', '-1']));
  });
});

describe('default opacity band', () => {
  it('uses DEFAULT_OPACITY_RANGE without an opacityRange, and still accepts belief bands down to 0.08', () => {
    for (let seed = 0; seed < 300; seed++) {
      const p = placeGhost(null, FRAMES[0]!, seed);
      expect(p.opacity).toBeGreaterThanOrEqual(DEFAULT_OPACITY_RANGE[0]);
      expect(p.opacity).toBeLessThanOrEqual(DEFAULT_OPACITY_RANGE[1]);
      const yes = placeGhost(null, FRAMES[0]!, seed, { opacityRange: [0.08, 0.14] });
      expect(yes.opacity).toBeLessThanOrEqual(0.14);
    }
  });
});
