import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tier as uiTier } from '../../ui/tokens';
import {
  DAY_MS, DRY_SPELL, TIER_TABLE, drawOutcome, freshHistory, seedFrom,
  type Intensity, type OutcomeHistory,
} from '../outcome';
import { TIERS, TIER_BOUNDS, tierBand, tierOf } from '../tiers';

const INTENSITIES: Intensity[] = ['calm', 'standard', 'brave'];
const seedAt = (i: number) => seedFrom(`photo-${i}`, 1_700_000_000_000 + i * 977);
const hist = (o: Partial<OutcomeHistory> = {}): OutcomeHistory => ({ ...freshHistory(1_700_000_000_000), ...o });

describe('tier bounds', () => {
  it('match src/ui/tokens.ts and the Bible', () => {
    expect({ ...TIER_BOUNDS }).toEqual({ ...uiTier });
    const bible = readFileSync('docs/instrument-bible.md', 'utf8');
    for (const [name, lo, hi] of [['QUIET', 0, 19], ['TRACE', 20, 44], ['ACTIVE', 45, 69], ['STRONG', 70, 89], ['CRITICAL', 90, 100]] as const) {
      expect(bible).toContain(`| ${name} | ${lo} to ${hi} |`);
      expect(tierBand(name.toLowerCase() as never)).toEqual({ min: lo, max: hi });
    }
  });
});

describe('seedFrom', () => {
  it('is deterministic and varies with hash and time', () => {
    expect(seedFrom('abc', 5)).toBe(seedFrom('abc', 5));
    expect(seedFrom('abc', 5)).not.toBe(seedFrom('abd', 5));
    expect(seedFrom('abc', 5)).not.toBe(seedFrom('abc', 6));
  });
});

/** psych-brief section 3, hard-coded on purpose: the test must not read its targets from the code under test. */
const BRIEF_TARGETS: Record<Intensity, number[]> = {
  calm: [30, 40, 22, 7, 1],
  standard: [20, 35, 28, 13, 4],
  brave: [12, 28, 32, 20, 8],
};

describe('tier distribution over 10,000 seeds', () => {
  it('TIER_TABLE equals the psych-brief section 3 targets', () => {
    for (const intensity of INTENSITIES) expect([...TIER_TABLE[intensity]]).toEqual(BRIEF_TARGETS[intensity]);
  });

  for (const intensity of INTENSITIES) {
    it(intensity, () => {
      const N = 10_000;
      const counts = [0, 0, 0, 0, 0];
      let figures = 0;
      for (let i = 0; i < N; i++) {
        const o = drawOutcome(seedAt(i), intensity, hist());
        counts[TIERS.indexOf(o.tier)]!++;
        if (o.figureShown) figures++;
      }
      const pct = counts.map((c) => (c / N) * 100);
      console.log(`${intensity} measured`, pct.map((p) => p.toFixed(2)).join('/'), 'figure', ((figures / N) * 100).toFixed(1));
      BRIEF_TARGETS[intensity].forEach((target, k) => expect(Math.abs(pct[k]! - target)).toBeLessThanOrEqual(1.5));
    });
  }
});

describe('outcome fields', () => {
  it('spi lies inside the tier band and tierOf agrees', () => {
    for (let i = 0; i < 3000; i++) {
      const o = drawOutcome(seedAt(i), 'brave', hist());
      const b = tierBand(o.tier);
      expect(Number.isInteger(o.spi)).toBe(true);
      expect(o.spi).toBeGreaterThanOrEqual(b.min);
      expect(o.spi).toBeLessThanOrEqual(b.max);
      expect(tierOf(o.spi)).toBe(o.tier);
    }
  });

  it('figure rate is about 19/34/50% overall', () => {
    const want: Record<Intensity, number> = { calm: 19, standard: 34, brave: 50 };
    for (const intensity of INTENSITIES) {
      let f = 0;
      for (let i = 0; i < 10_000; i++) if (drawOutcome(seedAt(i), intensity, hist()).figureShown) f++;
      expect(Math.abs(f / 100 - want[intensity])).toBeLessThan(2);
    }
  });

  it('figure rules by tier; smudge only on TRACE', () => {
    for (let i = 0; i < 4000; i++) {
      const o = drawOutcome(seedAt(i), 'standard', hist());
      if (o.tier === 'quiet' || o.tier === 'trace') expect(o.figureShown).toBe(false);
      if (o.tier === 'strong' || o.tier === 'critical') expect(o.figureShown).toBe(true);
      if (o.smudge) expect(o.tier).toBe('trace');
    }
  });

  it('scan duration: 6 to 8 s, +1 to 2 s on STRONG/CRITICAL and on about 30% of the rest', () => {
    let low = 0, lowLong = 0;
    for (let i = 0; i < 10_000; i++) {
      const o = drawOutcome(seedAt(i), 'standard', hist());
      if (o.tier === 'strong' || o.tier === 'critical') {
        expect(o.scanDurationMs).toBeGreaterThanOrEqual(7000);
        expect(o.scanDurationMs).toBeLessThanOrEqual(10000);
      } else {
        expect(o.scanDurationMs).toBeGreaterThanOrEqual(6000);
        expect(o.scanDurationMs).toBeLessThanOrEqual(10000);
        low++;
        if (o.scanDurationMs > 8000) lowLong++;
      }
    }
    // 30% extended; an extension pushes a 6..8 s base past 8 s with probability 0.75.
    expect(Math.abs((lowLong / low) * 100 - 22.5)).toBeLessThan(2);
  });

  it('is deterministic', () => {
    for (const intensity of INTENSITIES)
      for (let i = 0; i < 50; i++)
        expect(drawOutcome(seedAt(i), intensity, hist())).toEqual(drawOutcome(seedAt(i), intensity, hist()));
  });
});

describe('first-session rules', () => {
  it('scan 1 is ACTIVE 70% / STRONG 30%', () => {
    for (const intensity of INTENSITIES) {
      let strong = 0;
      for (let i = 0; i < 10_000; i++) {
        const o = drawOutcome(seedAt(i), intensity, hist({ scanCount: 0 }));
        expect(['active', 'strong']).toContain(o.tier);
        if (o.tier === 'strong') strong++;
      }
      expect(Math.abs(strong / 100 - 30)).toBeLessThan(2);
    }
  });

  it('no CRITICAL on scans 1 to 3, and none of them jump-scare', () => {
    for (const scanCount of [0, 1, 2])
      for (let i = 0; i < 5000; i++) {
        const o = drawOutcome(seedAt(i), 'brave', hist({ scanCount }));
        expect(o.tier).not.toBe('critical');
        expect(o.jumpScare).toBe(false);
      }
  });

  it('scans 2 and 3 move the CRITICAL share to STRONG', () => {
    let strong = 0;
    for (let i = 0; i < 10_000; i++) if (drawOutcome(seedAt(i), 'brave', hist({ scanCount: 1 })).tier === 'strong') strong++;
    expect(Math.abs(strong / 100 - 28)).toBeLessThan(1.5);
  });

  it('CRITICAL can occur from scan 4', () => {
    let n = 0;
    for (let i = 0; i < 3000; i++) if (drawOutcome(seedAt(i), 'brave', hist({ scanCount: 3 })).tier === 'critical') n++;
    expect(n).toBeGreaterThan(0);
  });
});

describe('spacing and dry-spell rules', () => {
  it('no CRITICAL within 5 scans of the last one, allowed at 5', () => {
    for (const since of [1, 2, 3, 4])
      for (let i = 0; i < 3000; i++) expect(drawOutcome(seedAt(i), 'brave', hist({ scansSinceCritical: since })).tier).not.toBe('critical');
    let n = 0;
    for (let i = 0; i < 3000; i++) if (drawOutcome(seedAt(i), 'brave', hist({ scansSinceCritical: 5 })).tier === 'critical') n++;
    expect(n).toBeGreaterThan(0);
  });

  it('forces STRONG after 12 / 16 / 8 dry scans, not before', () => {
    for (const intensity of INTENSITIES) {
      const limit = DRY_SPELL[intensity];
      expect(limit).toBe({ calm: 16, standard: 12, brave: 8 }[intensity]);
      let belowLimitLow = 0;
      for (let i = 0; i < 2000; i++) {
        expect(['strong', 'critical']).toContain(drawOutcome(seedAt(i), intensity, hist({ dryStreak: limit })).tier);
        if (['quiet', 'trace', 'active'].includes(drawOutcome(seedAt(i), intensity, hist({ dryStreak: limit - 1 })).tier)) belowLimitLow++;
      }
      expect(belowLimitLow).toBeGreaterThan(0);
    }
  });
});

describe('jump-scare', () => {
  const rate = (intensity: Intensity, h: Partial<OutcomeHistory>) => {
    let crit = 0, js = 0;
    for (let i = 0; i < 40_000; i++) {
      const o = drawOutcome(seedAt(i), intensity, hist(h));
      if (o.tier === 'critical') { crit++; if (o.jumpScare) js++; }
      else expect(o.jumpScare).toBe(false);
    }
    return js / crit;
  };

  it('0% calm, about 25% standard, about 50% brave given CRITICAL', () => {
    expect(rate('calm', {})).toBe(0);
    expect(Math.abs(rate('standard', {}) - 0.25)).toBeLessThan(0.05);
    expect(Math.abs(rate('brave', {}) - 0.5)).toBeLessThan(0.05);
  });

  it('standard: at most one per 24 h', () => {
    const now = 1_700_000_000_000;
    expect(rate('standard', { lastJumpScareMs: now - DAY_MS + 1000 })).toBe(0);
    expect(rate('standard', { lastJumpScareMs: now - DAY_MS - 1000 })).toBeGreaterThan(0.15);
  });

  it('brave: at most one per session', () => {
    expect(rate('brave', { jumpScareThisSession: true })).toBe(0);
  });
});
