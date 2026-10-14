import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { waitWarped } from './warped';
import { startClockAtEvening, waitPrinted } from './relay';

// P7-05. The screens at the longest strings: German, Spanish and European Portuguese at 390 and
// German again at 360. Goldens are named <screen>-<lang>.png (and -360 at the narrow width). The
// en goldens belong to the screen specs and are not touched here. Every screen is also swept for
// clipped, ellipsised or off-screen text, so a long word fails here and not on a phone.

const CLOCK = 'date=2026-10-13&time=22:48';
const SEED = 20261013;
const STRONG_SEED = 41;

const CASES = [
  { lang: 'de', project: 'android-390x844', suffix: '' },
  { lang: 'es', project: 'android-390x844', suffix: '' },
  { lang: 'pt', project: 'android-390x844', suffix: '' },
  { lang: 'de', project: 'android-360x800', suffix: '-360' },
] as const;

const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

function watch(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  return () => {
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  };
}

/** Text that is clipped, ellipsised or outside the screen, as `testid: text (why)` lines. */
async function overflows(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    const label = (e: Element) => `${e.closest('[data-testid]')?.getAttribute('data-testid') ?? e.tagName}: ${(e.textContent ?? '').trim().slice(0, 48)}`;
    if (document.documentElement.scrollWidth > vw) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
    for (const e of Array.from(document.querySelectorAll('body *'))) {
      if (!Array.from(e.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')) continue;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const box = e.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      // The ink: each own text node up to its last visible character (readout cells are padded with spaces).
      const ink = document.createRange();
      let first = true;
      for (const n of Array.from(e.childNodes)) {
        if (n.nodeType !== 3 || (n.textContent ?? '').trim() === '') continue;
        const txt = n.textContent ?? '';
        const lead = txt.length - txt.trimStart().length;
        if (first) ink.setStart(n, lead);
        ink.setEnd(n, txt.trimEnd().length);
        first = false;
      }
      const r = ink.getBoundingClientRect();
      // A glyph box is taller than its line box in VT323; a quarter of the font size is not a cut.
      const slack = Math.max(1, parseFloat(cs.fontSize) * 0.25);
      if (r.right > vw + 0.5 || r.left < -0.5) out.push(`${label(e)} (off screen ${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`);
      if (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) out.push(`${label(e)} (ellipsis ${e.scrollWidth} > ${e.clientWidth})`);
      for (let a: Element | null = e; a && a !== document.body; a = a.parentElement) {
        const ac = getComputedStyle(a);
        const ab = a.getBoundingClientRect();
        if (ac.overflowX === 'hidden' || ac.overflowX === 'clip') {
          if (r.right > ab.right + 1 || r.left < ab.left - 1) out.push(`${label(e)} (clipped sideways by ${a.getAttribute('data-testid') ?? a.tagName})`);
        }
        if (ac.overflowY === 'hidden' || ac.overflowY === 'clip') {
          if (ab.height <= 120 && (r.bottom > ab.bottom + slack || r.top < ab.top - slack)) out.push(`${label(e)} (clipped vertically by ${a.getAttribute('data-testid') ?? a.tagName})`);
        }
      }
    }
    return [...new Set(out)];
  });
}

/** Lines used by the text of each hardware key legend, by distinct rect tops. */
async function legendLines(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const res: Record<string, number> = {};
    for (const k of Array.from(document.querySelectorAll('[data-testid^="key-"]'))) {
      const r = document.createRange();
      r.selectNodeContents(k);
      const tops = new Set(Array.from(r.getClientRects()).filter((q) => q.width > 0).map((q) => Math.round(q.top / 4)));
      // No word is broken across lines: every word of the legend has all its rects on one line.
      const walker = document.createTreeWalker(k, NodeFilter.SHOW_TEXT);
      let broken = 0;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const txt = n.textContent ?? '';
        for (const m of txt.matchAll(/\S+/g)) {
          const w = document.createRange();
          w.setStart(n, m.index ?? 0);
          w.setEnd(n, (m.index ?? 0) + m[0].length);
          if (new Set(Array.from(w.getClientRects()).filter((q) => q.width > 0).map((q) => Math.round(q.top / 4))).size > 1) broken++;
        }
      }
      res[`${k.getAttribute('data-testid')}:${(k.textContent ?? '').trim()}`] = tops.size + (broken > 0 ? 100 : 0);
    }
    return res;
  });
}

/** Words that render across two lines (`COMPORTAMEN / TO`), on any visible text of the screen. */
async function brokenWords(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const txt = n.textContent ?? '';
      for (const m of txt.matchAll(/\S+/g)) {
        const w = document.createRange();
        w.setStart(n, m.index ?? 0);
        w.setEnd(n, (m.index ?? 0) + m[0].length);
        const tops = new Set(Array.from(w.getClientRects()).filter((q) => q.width > 0).map((q) => Math.round(q.top / 4)));
        if (tops.size > 1) out.push(`${el.closest('[data-testid]')?.getAttribute('data-testid') ?? el.tagName}: ${m[0]}`);
      }
    }
    return [...new Set(out)];
  });
}

/** The entity card: one label column, every value or bar starts at the same x, no label runs into it. */
async function profileColumns(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const card = document.querySelector('[data-testid="result-profile"]');
    if (!card) return [];
    const out: string[] = [];
    const rows = Array.from(card.children).filter((c) => c.children.length === 2);
    const starts: number[] = [];
    for (const row of rows) {
      const label = row.children[0]!;
      const value = row.children[1]!;
      const r = document.createRange();
      r.selectNodeContents(label);
      const ink = r.getBoundingClientRect();
      const v = value.getBoundingClientRect();
      starts.push(v.left);
      if (ink.right > v.left + 0.5) out.push(`label ${(label.textContent ?? '').trim()} ends at ${Math.round(ink.right)}, value starts at ${Math.round(v.left)}`);
      if (new Set(Array.from(r.getClientRects()).filter((q) => q.width > 0).map((q) => Math.round(q.top / 4))).size > 1) out.push(`label ${(label.textContent ?? '').trim()} wraps`);
    }
    if (starts.length > 0 && Math.max(...starts) - Math.min(...starts) > 0.5) out.push(`value column not aligned: ${starts.map(Math.round).join(', ')}`);
    return out;
  });
}

async function check(page: Page, name: string, testInfo: TestInfo) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/i18n-${name}.png` });
  expect(await overflows(page)).toEqual([]);
  expect(await brokenWords(page), 'a word is split across two lines').toEqual([]);
  expect(await profileColumns(page), 'entity card label column').toEqual([]);
  // Location tags: each legend inside its 44 dp hit area, 12 px between neighbouring hit areas.
  const tags = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="tag-cellar"],[data-testid="tag-attic"],[data-testid="tag-bedroom"],[data-testid="tag-hallway"],[data-testid="tag-outdoors"]')).filter((e) => e.getBoundingClientRect().width > 0).map((e) => {
      const b = e.getBoundingClientRect();
      const r = document.createRange();
      r.selectNodeContents(e);
      const t = r.getBoundingClientRect();
      return { id: e.getAttribute('data-testid'), l: b.left, r: b.right, tl: t.left, tr: t.right };
    }),
  );
  for (const t of tags) {
    expect(t.tl, `${t.id} text left`).toBeGreaterThanOrEqual(t.l - 0.5);
    expect(t.tr, `${t.id} text right`).toBeLessThanOrEqual(t.r + 0.5);
  }
  for (let i = 1; i < tags.length; i++) expect(tags[i]!.l - tags[i - 1]!.r, `gap before ${tags[i]!.id}`).toBeGreaterThanOrEqual(11.5);
  const lines = await legendLines(page);
  // 100 or more marks a word broken mid-word.
  for (const [k, n] of Object.entries(lines)) expect(n, k).toBeLessThanOrEqual(2);
}

async function settleResult(page: Page) {
  await expect(page.getByTestId('result-photo')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
  await expect(page.getByTestId('result-stamp')).toHaveAttribute('aria-busy', 'false');
  await frames(page);
  await waitWarped(page);
}

for (const { lang, project, suffix } of CASES) {
  test.describe(`${lang}${suffix}`, () => {
    test.beforeEach(({ page }, testInfo) => {
      void page;
      test.skip(testInfo.project.name !== project, `${lang}${suffix} goldens at ${project} only`);
    });
    const shot = async (page: Page, name: string) => {
      await expect(page).toHaveScreenshot(`${name}-${lang}${suffix}.png`, { maxDiffPixels: 150 });
    };

    test('boot and calibration card', async ({ page }, testInfo) => {
      const done = watch(page);
      await page.goto(`/?static=1&${CLOCK}&lang=${lang}`);
      await page.getByTestId('boot-screen').waitFor();
      await expect(page.getByTestId('transient')).toHaveCSS('opacity', '1');
      await waitWarped(page);
      await check(page, `boot-${lang}${suffix}`, testInfo);
      // The sticker is a rotated box: its content must not outgrow it (layout size, before the tilt).
      // (The folded corner adds 2 to 5 px of scroll extent in every language, so the rows are what is measured.)
      const rows = await page.getByTestId('sticker').evaluate((e) =>
        Array.from(e.querySelectorAll('div')).filter((d) => d.scrollWidth > d.clientWidth + 1).map((d) => `${(d.textContent ?? '').slice(0, 24)} ${d.scrollWidth}>${d.clientWidth}`),
      );
      expect(rows).toEqual([]);
      await shot(page, 'boot');
      await page.goto(`/?static=1&${CLOCK}&calib=1&lang=${lang}`);
      await page.getByTestId('boot-screen').waitFor();
      await waitWarped(page);
      await check(page, `boot-calib-${lang}${suffix}`, testInfo);
      await shot(page, 'boot-calib');
      done();
    });

    test('viewfinder', async ({ page }, testInfo) => {
      const done = watch(page);
      await page.goto(`/viewfinder?static=1&fixture=cellar&${CLOCK}&lang=${lang}`);
      await expect(page.getByTestId('screen-viewfinder')).toBeVisible();
      await page.getByTestId('hud-feed').locator('canvas').waitFor();
      await expect(page.getByTestId('emf-needle').locator('canvas')).toHaveCount(1);
      await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
      await check(page, `viewfinder-${lang}${suffix}`, testInfo);
      await shot(page, 'viewfinder');
      done();
    });

    for (const [name, phase] of [['scan-phase2', '2'], ['scan-hold', 'hold']] as const) {
      test(name, async ({ page }, testInfo) => {
        const done = watch(page);
        await page.goto(`/scan?static=1&phase=${phase}&seed=${phase === 'hold' ? STRONG_SEED : SEED}&lang=${lang}`);
        await expect(page.getByTestId('screen-scan')).toBeVisible();
        await expect(page.getByTestId('scan-bar')).toBeVisible();
        await check(page, `${name}-${lang}${suffix}`, testInfo);
        await shot(page, name);
        done();
      });
    }

    for (const [name, url] of [
      ['result-active', '/result/demo?static=1&fixture=cellar&demo=active'],
      ['result-deepscan-unlocked', '/result/demo?static=1&fixture=cellar&demo=strong&deepscan=unlocked'],
      ['result-share-offer', '/result/demo?static=1&fixture=cellar&demo=active&share=offer'],
    ] as const) {
      test(name, async ({ page }, testInfo) => {
        const done = watch(page);
        await page.goto(`${url}&lang=${lang}`);
        await expect(page.getByTestId('screen-result')).toBeVisible();
        await settleResult(page);
        await check(page, `${name}-${lang}${suffix}`, testInfo);
        // The data strip is drawn into a canvas: case, SPI, ΔT, time and the mark must end inside its width.
        const strip = page.getByTestId('result-stamp');
        const w = Number(await strip.getAttribute('data-text-w'));
        const box = (await strip.boundingBox())!;
        expect(w).toBeGreaterThan(0);
        expect(w + 8 + 4, `strip text ${w} px of ${box.width}: 8 px margin and 4 px slack`).toBeLessThanOrEqual(box.width);
        expect(await strip.getAttribute('aria-label')).toMatch(/SIMULIERT|SIMULADO/);
        await shot(page, name);
        done();
      });
    }

    // The share format choice prints its keys in the locale (A-49, A-50); goldens at 390 only.
    test('result-share-format', async ({ page }, testInfo) => {
      test.skip(suffix !== '', 'share format goldens at 390 only');
      const done = watch(page);
      await page.goto(`/result/demo?static=1&fixture=cellar&demo=active&share=format&lang=${lang}`);
      await expect(page.getByTestId('share-panel')).toBeVisible();
      await settleResult(page);
      await check(page, `result-share-format-${lang}${suffix}`, testInfo);
      await expect(page.getByTestId('share-916')).not.toHaveText('');
      await expect(page.getByTestId('share-11')).not.toHaveText('');
      await shot(page, 'result-share-format');
      done();
    });

    // The armed DEEP SCAN line reflows to two lines in German at 360 and is never clipped (D-045 1);
    // Spanish and Portuguese have goldens at 390.
    test('result-deepscan-armed', async ({ page }, testInfo) => {
      test.skip(!((lang === 'de' && suffix === '-360') || ((lang === 'es' || lang === 'pt') && suffix === '')), 'armed goldens: de at 360, es and pt at 390');
      const done = watch(page);
      await page.goto(`/result/demo?static=1&fixture=cellar&demo=strong&lang=${lang}`);
      await expect(page.getByTestId('screen-result')).toBeVisible();
      await settleResult(page);
      await page.waitForTimeout(700);
      await page.getByTestId('deepscan-key').click();
      const line = page.getByTestId('deepscan-line');
      await expect(line).toBeVisible();
      await settleResult(page);
      await check(page, `result-deepscan-armed-${lang}${suffix}`, testInfo);
      const clipped = await line.evaluate((e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1);
      expect(clipped, 'armed line clipped').toBe(false);
      await shot(page, 'result-deepscan-armed');
      done();
    });

    test('history with three tags', async ({ page }, testInfo) => {
      const done = watch(page);
      await page.goto(`/history?static=1&log=demo3&lang=${lang}`);
      await expect(page.getByTestId('history-tag-cellar')).toBeVisible();
      await check(page, `history-${lang}${suffix}`, testInfo);
      await shot(page, 'history-3tags');
      // The list scrolls: the last row (0005, SCHLAFZIMMER group in de) is reachable and sits whole inside the list.
      const list = page.getByTestId('history-list');
      const row = page.getByTestId('history-row-0005');
      await row.evaluate((e) => e.scrollIntoView({ block: 'end' }));
      const lb = (await list.boundingBox())!;
      const rb = (await row.boundingBox())!;
      expect(rb.y, 'row 0005 top inside the list').toBeGreaterThanOrEqual(lb.y - 0.5);
      expect(rb.y + rb.height, 'row 0005 bottom inside the list').toBeLessThanOrEqual(lb.y + lb.height + 0.5);
      done();
    });

    test('settings', async ({ page }, testInfo) => {
      const done = watch(page);
      await page.goto(`/settings?static=1&lang=${lang}`);
      await expect(page.getByTestId('screen-settings')).toBeVisible();
      await check(page, `settings-${lang}${suffix}`, testInfo);
      await shot(page, 'settings');
      done();
    });

    test('relay module', async ({ page }, testInfo) => {
      const done = watch(page);
      await startClockAtEvening(page);
      await page.goto(`/history?static=1&log=demo3&session=1&notify=granted&lang=${lang}`);
      await page.getByTestId('history-row-0001').filter({ visible: true }).click();
      const result = page.getByTestId('screen-result').last();
      await expect(result).toBeVisible();
      await result.getByTestId('key-back').click();
      await expect(page.getByTestId('screen-viewfinder').last()).toBeVisible();
      const mod = page.getByTestId('relay-module');
      await expect(mod).toBeVisible();
      await waitPrinted(page);
      await check(page, `relay-${lang}${suffix}`, testInfo);
      const m = (await mod.boundingBox())!;
      const body = await page.getByTestId('relay-body').evaluate((e) => {
        const r = document.createRange();
        r.selectNodeContents(e);
        const b = r.getBoundingClientRect();
        return { l: b.left, r: b.right, b: b.bottom };
      });
      expect(body.l).toBeGreaterThanOrEqual(m.x - 0.5);
      expect(body.r).toBeLessThanOrEqual(m.x + m.width + 0.5);
      expect(body.b).toBeLessThanOrEqual(m.y + m.height + 0.5);
      await shot(page, 'relay-module');
      done();
    });
  });
}

// The mark closes the data strip in every language: the strip's text ends with it and the element
// does not scroll sideways. German is checked at both widths; the rest at 390.
const MARKS = [
  { lang: 'en', project: 'android-390x844', mark: 'SIMULATED' },
  { lang: 'de', project: 'android-390x844', mark: 'SIMULIERT' },
  { lang: 'de', project: 'android-360x800', mark: 'SIMULIERT' },
  { lang: 'es', project: 'android-390x844', mark: 'SIMULADO' },
  { lang: 'pt', project: 'android-390x844', mark: 'SIMULADO' },
] as const;
for (const { lang, project, mark } of MARKS) {
  test(`mark visible: the strip ends with ${mark} (${lang}, ${project})`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== project, `${project} only`);
    await page.goto(`/result/demo?static=1&fixture=cellar&demo=active&lang=${lang}`);
    await expect(page.getByTestId('screen-result')).toBeVisible();
    await settleResult(page);
    const strip = page.getByTestId('result-stamp');
    expect(((await strip.getAttribute('aria-label')) ?? '').trim().endsWith(mark)).toBe(true);
    const m = await strip.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    expect(m.sw, `scrollWidth ${m.sw} vs clientWidth ${m.cw}`).toBeLessThanOrEqual(m.cw + 1);
    const w = Number(await strip.getAttribute('data-text-w'));
    expect(w + 8 + 4).toBeLessThanOrEqual((await strip.boundingBox())!.width);
    // The same on the thermal view (D-034, D-041): strip kept, mark last, nothing clipped.
    await page.getByTestId('key-therm').click();
    await expect(page.getByTestId('thermal-view')).toBeVisible({ timeout: 15_000 });
    await expect(strip).toHaveAttribute('aria-busy', 'false');
    expect(((await strip.getAttribute('aria-label')) ?? '').trim().endsWith(mark)).toBe(true);
    expect(Number(await strip.getAttribute('data-text-w')) + 8 + 4).toBeLessThanOrEqual((await strip.boundingBox())!.width);
  });
}
