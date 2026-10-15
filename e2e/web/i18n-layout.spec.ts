import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { waitWarped } from './warped';
import { brokenWords, legendLines, overflows, profileColumns } from './layout';
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

    // A-52: the profile head clears the rule above it by at least 4 px; A-53: the housing sticker's text is
    // never clipped (every printed row whole inside the paper, and the paper inside the screen).
    test('profile head clears its rule and the sticker is not clipped', async ({ page }) => {
      const done = watch(page);
      await page.goto(`/result/demo?static=1&fixture=cellar&demo=strong&deepscan=unlocked&lang=${lang}`);
      await expect(page.getByTestId('screen-result')).toBeVisible();
      await settleResult(page);
      const prof = (await page.getByTestId('result-profile').boundingBox())!;
      const head = (await page.getByTestId('result-profile').locator('div[dir="auto"]').first().boundingBox())!;
      expect(head.y - (prof.y + 1), 'head to rule').toBeGreaterThanOrEqual(4);
      const mini = page.getByTestId('sticker-mini');
      const cut = await mini.locator('div[dir="auto"]').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length);
      expect(cut, 'sticker rows clipped').toBe(0);
      const m = (await mini.boundingBox())!;
      const vw = page.viewportSize()!.width;
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x + m.width).toBeLessThanOrEqual(vw - 40);
      done();
    });

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
