import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { waitWarped } from './warped';
import { startClockAtEvening, waitPrinted } from './relay';

// P8-04 clauses 1, 2 and 6. Every interactive element of the key screens, in en and de:
//  - it exposes a role and a non-empty accessible name in the active locale (under ?lang=de the name must
//    differ from the en name unless it is an instrument word the locale keeps);
//  - its hit area is at least 44 x 44 dp (the element plus its hit-slop child);
//  - axe reports no serious or critical violation (no rule is excluded).

type Hit = { id: string; role: string | null; name: string; w: number; h: number };

const CLOCK = 'date=2026-10-13&time=22:48';
const STEPS: { name: string; url: string; wait?: string; ready?: (p: Page) => Promise<unknown>; act?: (p: Page) => Promise<void> }[] = [
  { name: 'boot', wait: 'key-acknowledge', url: `/?static=1&fixture=cellar&${CLOCK}` },
  {
    name: 'boot-calibration',
    wait: 'key-acknowledge',
    url: `/?static=1&fixture=cellar&${CLOCK}`,
    act: async (p) => {
      await p.getByTestId('key-acknowledge').click();
      await expect(p.getByTestId('key-calib-yes')).toBeVisible();
    },
  },
  { name: 'viewfinder', wait: 'key-log', url: `/viewfinder?static=1&fixture=cellar&speed=8&session=0&${CLOCK}` },
  { name: 'result', wait: 'key-back', url: '/result/demo?static=1&fixture=cellar&demo=active', ready: waitWarped },
  { name: 'result-share', wait: 'key-back', url: '/result/demo?static=1&fixture=cellar&demo=active&share=format', ready: waitWarped },
  { name: 'history', wait: 'screen-history', url: '/history?static=1&log=demo3' },
  { name: 'settings', wait: 'setting-sound', url: '/settings?static=1' },
  { name: 'legal', wait: 'key-forward', url: '/legal?static=1' },
  {
    name: 'relay',
    wait: 'history-row-0001',
    url: '/history?static=1&log=demo3&session=1&notify=granted',
    act: async (p) => {
      await p.getByTestId('history-row-0001').filter({ visible: true }).click();
      await p.getByTestId('screen-result').last().getByTestId('key-back').click();
      await p.getByTestId('relay-module').waitFor({ state: 'visible', timeout: 15000 });
      await waitPrinted(p);
    },
  },
  { name: 'viewfinder-denied', wait: 'key-allow', url: '/viewfinder?static=1&speed=8&fault=camera-denied' },
  { name: 'scan', wait: 'key-cancel', url: '/scan?static=1&phase=hold&seed=41' },
  { name: 'history-empty', wait: 'history-empty', url: '/history?static=1' },
  {
    name: 'relay-fitted',
    wait: 'history-row-0001',
    url: '/history?static=1&log=demo3&session=1&notify=granted',
    act: async (p) => {
      await p.getByTestId('history-row-0001').filter({ visible: true }).click();
      await p.getByTestId('screen-result').last().getByTestId('key-back').click();
      await waitPrinted(p);
      await p.getByTestId('relay-fit').click();
      await p.getByTestId('relay-result-box').waitFor({ state: 'visible', timeout: 15000 });
    },
  },
  { name: 'fault', wait: 'key-reset', url: '/viewfinder?static=1&fault=skia' },
];

/** Elements a finger can press: the cursor turns to a pointer on the element and not on its parent. */
async function interactive(page: Page): Promise<Hit[]> {
  return page.evaluate(() => {
    const out: Hit[] = [];
    const nameOf = (e: Element): string => {
      const aria = e.getAttribute('aria-label');
      if (aria && aria.trim()) return aria.trim();
      const by = e.getAttribute('aria-labelledby');
      if (by) {
        const t = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
        if (t) return t;
      }
      return (e.textContent ?? '').trim();
    };
    const all = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    let anon = 0;
    for (const e of all) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const pointer = cs.cursor === 'pointer' && (!e.parentElement || getComputedStyle(e.parentElement).cursor !== 'pointer');
      const tabbable = e.tabIndex >= 0 && e.getAttribute('tabindex') !== null;
      const role = e.getAttribute('role');
      const isCtl = pointer || tabbable || ['button', 'tab', 'switch', 'link'].includes(role ?? '');
      if (!isCtl) continue;
      if (e.closest('[aria-hidden="true"]') || e.getAttribute('data-testid') === 'key-dummy') continue;
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      let l = r.left, t = r.top, rr = r.right, b = r.bottom;
      // RN Web draws hitSlop as an empty absolutely positioned child.
      for (const c of Array.from(e.children)) {
        const cc = c as HTMLElement;
        if (getComputedStyle(cc).position === 'absolute' && (cc.textContent ?? '') === '' && cc.children.length === 0) {
          const q = cc.getBoundingClientRect();
          if (q.width > 0 && q.height > 0) { l = Math.min(l, q.left); t = Math.min(t, q.top); rr = Math.max(rr, q.right); b = Math.max(b, q.bottom); }
        }
      }
      out.push({ id: e.getAttribute('data-testid') ?? `anon${anon++}`, role, name: nameOf(e), w: Math.round((rr - l) * 10) / 10, h: Math.round((b - t) * 10) / 10 });
    }
    return out;
  });
}

// Words an instrument keeps in every locale, so the de name may equal the en name.
const KEPT = /^(ACK|SPI|EMF|REC|RESET|OK|PRO|LOG|IMPRESSUM)$/i;

async function open(page: Page, step: (typeof STEPS)[number], lang: string) {
  const sep = step.url.includes('?') ? '&' : '?';
  // The relay offer is made once per install: a second visit in the same context starts clean.
  await page.evaluate(() => localStorage.clear()).catch(() => undefined);
  if (step.name.startsWith('relay')) await startClockAtEvening(page);
  await page.goto(`${step.url}${sep}lang=${lang}`);
  if (step.wait) await page.getByTestId(step.wait).first().waitFor({ state: 'attached', timeout: 20000 });
  await step.ready?.(page);
  await step.act?.(page);
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}

for (const step of STEPS) {
  test(`${step.name}: every control has a role, a localised name and a 44 dp hit area`, async ({ page }, info) => {
    test.setTimeout(60_000);
    const byLang: Record<string, Hit[]> = {};
    for (const lang of ['en', 'de']) {
      await open(page, step, lang);
      byLang[lang] = await interactive(page);
      expect(byLang[lang]!.length, `${step.name} ${lang} has controls`).toBeGreaterThan(0);
    }
    const bad: string[] = [];
    for (const [lang, hits] of Object.entries(byLang)) {
      for (const h of hits) {
        if (!['button', 'tab', 'switch', 'link', 'checkbox', 'radio'].includes(h.role ?? '')) bad.push(`${lang} ${h.id}: role ${h.role}`);
        if (h.name === '') bad.push(`${lang} ${h.id}: empty name`);
        if (h.w < 44 || h.h < 44) bad.push(`${lang} ${h.id}: hit area ${h.w} x ${h.h} < 44 at ${info.project.name}`);
      }
    }
    // The fitted relay line is a control in both languages.
    if (step.name === 'relay-fitted') for (const l of ['en', 'de']) expect(byLang[l]!.map((h) => h.id), `${l} has the result line`).toContain('relay-result-box');
    const en = new Map(byLang.en!.map((h) => [h.id, h.name]));
    for (const h of byLang.de!) {
      const e = en.get(h.id);
      if (e !== undefined && e === h.name && !KEPT.test(h.name) && /[A-Za-z]{4,}/.test(h.name)) bad.push(`de ${h.id}: name unchanged from en "${h.name}"`);
    }
    console.log(`[a11y] ${step.name} ${info.project.name}: en ${byLang.en!.map((h) => `${h.id}(${h.role})`).join(' ')} | de ${byLang.de!.map((h) => `${h.id}:${h.name}`).join(' | ')}`);
    expect(bad).toEqual([]);
  });
}

// No rule is excluded. axe reports text it cannot resolve (over a photo or a canvas) as `incomplete`, not as a
// violation; the phosphor tokens are measured separately in src/ui/__tests__/contrast.test.ts.

for (const lang of ['en', 'de']) {
  for (const step of STEPS) {
    test(`axe: ${step.name} (${lang}) has no serious or critical violation`, async ({ page }, info) => {
      test.skip(info.project.name !== 'android-390x844', 'axe runs at 390');
      test.setTimeout(60_000);
      await open(page, step, lang);
      const res = await new AxeBuilder({ page }).analyze();
      const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
  }
}
