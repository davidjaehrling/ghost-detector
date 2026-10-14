import { expect, test } from '@playwright/test';

// P6-03. The investigation log: empty state, three tags, case rows, a reopened case.

const DEMO = '/history?static=1&log=demo3';

test('empty log', async ({ page }) => {
  await page.goto('/history?static=1');
  await expect(page.getByTestId('screen-history')).toBeVisible();
  await expect(page.getByText('No cases logged.')).toBeVisible();
  await expect(page.getByTestId('history-nights')).toHaveText('NIGHTS LOGGED 0');
  await expect(page.locator('[data-testid^="history-row-"]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('history-empty.png', { maxDiffPixels: 150 });
});

test('three tags: record rows, case rows, nights, no DEEP SCAN key in the list', async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.getByTestId('history-tag-cellar')).toBeVisible();
  await expect(page.getByTestId('history-nights')).toHaveText('NIGHTS LOGGED 5');
  await expect(page.getByTestId('history-best')).toHaveText('BEST ON FILE 94 CRITICAL');
  const label = (tag: string) => page.getByTestId(`history-tag-${tag}`).getAttribute('aria-label');
  expect(await label('cellar')).toBe('CELLAR · 3 CASES · PEAK 80 STRONG · 2026-10-13 22:48');
  expect(await label('attic')).toBe('ATTIC · 1 CASE · PEAK 94 CRITICAL · 2026-10-12 21:30');
  expect(await label('bedroom')).toMatch(/^BEDROOM · 2 CASES · PEAK \d+ \w+ · 2026-10-\d\d \d\d:\d\d$/);
  // Case rows: ID, SPI, tier; UNRESOLVED only where a Deep Scan is still open.
  const strong = page.getByTestId('history-row-0003');
  await expect(strong).toContainText('0003 · 80 STRONG');
  await expect(strong).toContainText(/UNRESOLVED \d+%/);
  await expect(page.getByTestId('history-row-0001')).not.toContainText('UNRESOLVED');
  // A reading surface: no DEEP SCAN key, no streak, badge or countdown wording.
  const body = (await page.getByTestId('screen-history').innerText()).toUpperCase();
  for (const w of ['DEEP SCAN', 'STREAK', 'BADGE', 'EXPIRE', 'COME BACK', 'MISSED']) expect(body).not.toContain(w);
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('history-3tags.png', { maxDiffPixels: 150 });
});

test('no wrap on the settings key legend', async ({ page }) => {
  await page.goto('/history?static=1');
  const key = page.getByTestId('key-forward');
  const lines = await key.evaluate((e) => {
    const t = e.querySelector('div,span') as HTMLElement;
    const r = document.createRange();
    r.selectNodeContents(t);
    return new Set(Array.from(r.getClientRects()).map((q) => Math.round(q.top))).size;
  });
  expect(lines).toBe(1);
});

test('a case row opens the stored result with its standing DEEP SCAN key', async ({ page }) => {
  await page.goto(DEMO);
  await page.getByTestId('history-row-0003').click();
  await expect(page.getByTestId('screen-result')).toBeVisible();
  await expect(page.getByText('CASE 0003')).toBeVisible();
  await expect(page.getByTestId('deepscan-key')).toBeVisible();
  // A closed-then-reopened case keeps its decode: nothing expires.
  await expect(page.getByTestId('result-decoded')).toContainText('%');
});
