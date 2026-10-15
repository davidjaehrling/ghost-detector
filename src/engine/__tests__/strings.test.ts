import { describe, expect, it } from 'vitest';
import enJson from '../../../locales/engine/en.json';
import { generateProfile, generateProfileWith } from '../profile';
import { cleanTag, nextNotification, nextNotificationWith, type NotifyState } from '../notify';
import { seedFrom } from '../outcome';
import { TIERS } from '../tiers';
import {
  EN_LISTS, bank, checkStrings, en, extraKeys, fill, missingKeys, placeholderMismatches, placeholders,
  type EngineStrings,
} from '../strings';

const SEEDS = Array.from({ length: 500 }, (_, i) => seedFrom(`seed-${i}`, i * 7919));

describe('en table', () => {
  it('is the JSON file, with the documented key scheme only', () => {
    expect(en).toBe(enJson);
    const ok = /^(profile\.(class|prefix|temperament|attachment|behaviour|timing|detail)\.\d{2}|profile\.era|notify\.prefix|notify\.t[1-5]\.(title|body(\.one|\.other|\.untagged)?)|notify\.t5\.last|notify\.lore\.[a-z0-9 -]+)$/;
    expect(Object.keys(en).filter((k) => !ok.test(k))).toEqual([]);
  });
  it('banks are contiguous and class/prefix are index-matched', () => {
    expect(bank(en, 'profile.class')).toHaveLength(24);
    expect(bank(en, 'profile.prefix')).toHaveLength(24);
    for (const p of ['temperament', 'attachment', 'behaviour', 'timing']) expect(bank(en, `profile.${p}`)).toHaveLength(24);
    expect(bank(en, 'profile.detail')).toHaveLength(6);
    const total = Object.keys(en).filter((k) => /^profile\.(class|prefix|temperament|attachment|behaviour|timing|detail)\./.test(k)).length;
    expect(total).toBe(24 * 6 + 6);
  });
  it('passes the banned-word, claim-word and em-dash checks over every key', () => {
    expect(checkStrings(en, EN_LISTS)).toEqual([]);
  });
});

describe('explicit table equals the en wrappers', () => {
  it('generateProfile, 500 seeds x 3 tiers', () => {
    for (const seed of SEEDS) {
      for (const tier of TIERS) {
        const recent = { names: ['RSD-0001-A'], lines: [en['profile.temperament.00']!] };
        expect(generateProfileWith(seed, tier, recent, en)).toEqual(generateProfile(seed, tier, recent));
      }
    }
  });
  it('nextNotification, 500 seeds across states', () => {
    const DAY = 86_400_000;
    for (let i = 0; i < SEEDS.length; i++) {
      const nowMs = Date.UTC(2026, 9, 1) + i * 5 * DAY + (i % 7) * 3_600_000;
      const tags = i % 3 === 0 ? ['cellar', 'cellar', 'attic'] : ['stairs', 'stairs'];
      const s: NotifyState = {
        intensity: (['calm', 'standard', 'brave'] as const)[i % 3]!, belief: i % 2 ? 'yes' : 'unsure',
        jumpScaresOff: false, sessionCount: 3, optedIn: true, installMs: nowMs - 30 * DAY, lastAppOpenMs: nowMs - 1000,
        scans: [{ caseId: i + 1, atMs: nowMs - DAY, tier: 'trace', spi: 40, decodedPct: 41 + (i % 30), decoded: i % 5 === 0, declined: false, newClass: i % 5 === 0, tags: [] }],
        loggedTags: tags, catalogueCount: 1 + (i % 24), lastLoggedClass: i % 4 ? 'ECHO' : undefined,
        sent: [], nowMs, utcOffsetMin: 120,
      };
      expect(nextNotificationWith(s, SEEDS[i]!, en)).toEqual(nextNotification(s, SEEDS[i]!));
    }
  });
});

describe('injection', () => {
  it('uses the injected table and formatter', () => {
    const xx: EngineStrings = {
      ...en,
      'profile.era': 'Epoche {start} bis {end}',
      ...Object.fromEntries(bank(en, 'profile.detail').map((_, i) => [`profile.detail.${String(i).padStart(2, '0')}`, 'Drift {dt} / {n} / {n4}'])),
    };
    const fmt = (n: number, d?: number) => (d === undefined ? `<${n}>` : n.toFixed(d).replace('.', ','));
    const out = Array.from({ length: 100 }, (_, i) => generateProfileWith(i + 1, 'active', { names: [], lines: [] }, xx, fmt));
    for (const p of out) {
      expect(p.era).toMatch(/^Epoche <\d+> bis <\d+>$/);
      for (const t of p.traits.filter((l) => l.startsWith('Drift'))) expect(t).toMatch(/^Drift -\d,\d \/ <\d+> \/ \d{4}$/);
    }
  });
  it('fill leaves unknown placeholders and placeholders() lists names', () => {
    expect(fill('a {x} {y}', { x: '1' })).toBe('a 1 {y}');
    expect(placeholders('{b} {a} {b}')).toEqual(['a', 'b']);
  });
});

describe('per-locale helpers', () => {
  it('missingKeys, extraKeys and placeholderMismatches', () => {
    const other = { ...en } as Record<string, string>;
    delete other['notify.t1.body'];
    other['notify.t2.body'] = 'Vollmond. {idx22}/5';
    other['zz.extra'] = 'x';
    expect(missingKeys(en, other)).toEqual(['notify.t1.body']);
    expect(extraKeys(en, other)).toEqual(['zz.extra']);
    expect(placeholderMismatches(en, other)).toEqual(['notify.t2.body']);
  });
  it('checkStrings is Unicode-aware: stems, whole words, framing on titles, exempt literals', () => {
    const hits = checkStrings(
      {
        'a.b': 'Bestätigt und geprüft', 'a.c': 'Unbestätigt', 'notify.c': 'Aktiv jetzt', 'd.e': 'Aktiv jetzt',
        'f.g': 'x \u2014 y', 'h.i': 'Tiefgründig', 'notify.t1.title': 'Echt ACTIVE E-07', 'notify.t1.body': 'Echt',
      },
      { banned: ['tiefgr*'], claim: ['bestätigt'], claimNotify: ['aktiv'], framing: ['echt', 'active'], exempt: ['ACTIVE', 'E-07'] },
    );
    expect(hits.map((h) => `${h.key}:${h.kind}`).sort()).toEqual([
      'a.b:claim', 'f.g:emdash', 'h.i:banned', 'notify.c:claim', 'notify.t1.title:framing',
    ]);
  });
});

describe('unicode tags', () => {
  const base = (tags: string[], belief: 'yes' | 'no'): NotifyState => {
    const nowMs = Date.UTC(2026, 9, 1);
    return {
      intensity: 'standard', belief, jumpScaresOff: false, sessionCount: 3, optedIn: true, installMs: nowMs - 30 * 86_400_000,
      lastAppOpenMs: nowMs - 1000, scans: [], loggedTags: tags, catalogueCount: 1, sent: [], nowMs, utcOffsetMin: 0,
    };
  };
  it('cleanTag keeps letters and still drops banned and claim words', () => {
    expect(cleanTag('  Küche!! ')).toBe('küche');
    expect(cleanTag('Sótão')).toBe('sótão');
    expect(cleanTag('Verified')).toBeNull();
    expect(cleanTag('real')).toBeNull();
    expect(cleanTag('unreal')).toBe('unreal');
  });
  it('Küche and sótão reach template 3 with their letters; lore resolves via the folded key', () => {
    const table: EngineStrings = { ...en, 'notify.lore.kuche': 'Küchen halten warme Rohre.', 'notify.lore.sotao': 'Sótãos guardam calor.' };
    let seen = 0;
    for (const [tag, lore] of [['Küche', 'Küchen halten warme Rohre.'], ['sótão', 'Sótãos guardam calor.']] as const) {
      for (let day = 0; day < 400; day++) {
        const s = base([tag, tag], 'yes');
        s.nowMs += day * 86_400_000;
        s.lastAppOpenMs = s.nowMs - 1000;
        const n = nextNotificationWith(s, 1, table);
        if (n?.templateId !== 3) continue;
        seen++;
        expect(n.title).toContain(tag.toLocaleUpperCase());
        expect(n.body).toContain(tag.charAt(0).toLocaleUpperCase() + tag.slice(1).toLocaleLowerCase());
        expect(n.body).toContain(lore);
        const no = nextNotificationWith({ ...s, belief: 'no' }, 1, table);
        if (no?.templateId === 3) expect(no.body).not.toContain(lore);
        break;
      }
    }
    expect(seen).toBe(2);
  });
});
