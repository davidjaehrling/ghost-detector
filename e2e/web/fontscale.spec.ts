import { expect, test, type Page } from '@playwright/test';
import { waitWarped } from './warped';
import { brokenWords, legendLines, overflows, profileColumns } from './layout';

// P8-04 clause 4. The Android font-size setting at 1.3, emulated by `?fontScale=1.3` (src/ui/fontScale.ts,
// the way `?lang=` works): result, settings and history at 390 with no clipped or ellipsised text, no word
// split across lines, no hardware legend over two lines; goldens fs13; and on settings at 360 the ABOUT
// simulated line stays inside the visible glass without scrolling (D-045).

const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function sweep(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await frames(page);
  expect(await overflows(page)).toEqual([]);
  expect(await brokenWords(page), 'a word is split across two lines').toEqual([]);
  expect(await profileColumns(page), 'entity card label column').toEqual([]);
  for (const [k, n] of Object.entries(await legendLines(page))) expect(n, `legend ${k}`).toBeLessThanOrEqual(2);
}

test('result at font scale 1.3', async ({ page }, info) => {
  test.skip(info.project.name !== 'android-390x844', '390 only');
  await page.goto('/result/demo?static=1&fixture=cellar&demo=active&fontScale=1.3');
  await expect(page.getByTestId('result-photo')).toBeVisible();
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
  await expect(page.getByTestId('result-stamp')).toHaveAttribute('aria-busy', 'false');
  await waitWarped(page);
  await sweep(page);
  await expect(page).toHaveScreenshot('result-active-fs13.png', { maxDiffPixels: 150 });
});

test('settings at font scale 1.3', async ({ page }, info) => {
  test.skip(info.project.name !== 'android-390x844', '390 only');
  await page.goto('/settings?static=1&fontScale=1.3');
  await expect(page.getByTestId('setting-sound')).toBeVisible();
  await sweep(page);
  await expect(page).toHaveScreenshot('settings-fs13.png', { maxDiffPixels: 150 });
});

test('history with three tags at font scale 1.3', async ({ page }, info) => {
  test.skip(info.project.name !== 'android-390x844', '390 only');
  await page.goto('/history?static=1&log=demo3&fontScale=1.3');
  await expect(page.getByTestId('history-row-0003').first()).toBeVisible();
  await sweep(page);
  await expect(page).toHaveScreenshot('history-3tags-fs13.png', { maxDiffPixels: 150 });
});

test('the harness scales text: a settings row label is 1.3 times larger', async ({ page }, info) => {
  test.skip(info.project.name !== 'android-390x844', '390 only');
  await page.goto('/settings?static=1');
  const base = await page.getByTestId('setting-sound').locator('div').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  await page.goto('/settings?static=1&fontScale=1.3');
  const big = await page.getByTestId('setting-sound').locator('div').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(big / base).toBeCloseTo(1.3, 1);
});

test('settings at 360 and 1.3: the ABOUT simulated line is visible without scrolling', async ({ page }, info) => {
  test.skip(info.project.name !== 'android-360x800', '360 only');
  await page.goto('/settings?static=1&fontScale=1.3');
  const about = page.getByTestId('settings-about');
  await expect(about).toBeVisible();
  const list = (await page.getByTestId('settings-list').boundingBox())!;
  const b = (await about.boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(list.y);
  expect(b.y + b.height).toBeLessThanOrEqual(list.y + list.height + 0.5);
  expect(await page.getByTestId('settings-list').evaluate((e) => e.scrollTop)).toBe(0);
  expect(await overflows(page)).toEqual([]);
});
