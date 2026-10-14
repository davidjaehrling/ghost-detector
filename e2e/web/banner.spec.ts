import { expect, test, type Page } from '@playwright/test';

// P5-06, reworked under D-045. One banner slot, on the history screen only: absent on boot, viewfinder,
// scan, result and settings; present on history with a fixed height between the window and the key row,
// 32 dp or more from every key and every row, plain housing paint when empty.

const SLOT = 'ad-banner-slot';

async function absent(page: Page, url: string, screen: string) {
  await page.goto(url);
  await expect(page.getByTestId(screen).first()).toBeVisible();
  await page.waitForTimeout(250);
  await expect(page.getByTestId(SLOT)).toHaveCount(0);
}

test('the banner slot is absent on boot, viewfinder, scan, result and settings', async ({ page }) => {
  await absent(page, '/?static=1&date=2026-10-13', 'key-acknowledge');
  await absent(page, '/viewfinder?static=1', 'screen-viewfinder');
  await absent(page, '/scan?static=1&phase=2&seed=41', 'screen-scan');
  await absent(page, '/result/demo?static=1&fixture=cellar&demo=active', 'screen-result');
  await absent(page, '/settings?static=1', 'screen-settings');
});

const CLEAR = 32;

// Measures, in CSS px, the slot against everything above it (rows, list, window) and below it (keys).
async function slotClearance(page: Page) {
  return page.evaluate(() => {
    const box = (sel: string) => Array.from(document.querySelectorAll(sel)).map((e) => e.getBoundingClientRect());
    const slot = document.querySelector('[data-testid="ad-banner-slot"]')!.getBoundingClientRect();
    const list = document.querySelector('[data-testid="history-list"]')!.getBoundingClientRect();
    const rows = box('[data-testid^="history-row-"]').map((r) => Math.min(r.bottom, list.bottom));
    const keys = box('[data-testid^="key-"]').map((r) => r.top);
    const glass = document.querySelector('[data-testid="screen-history"]')!.querySelector('[data-testid$="-glass"]')?.getBoundingClientRect() ?? null;
    return {
      slotTop: slot.top,
      slotBottom: slot.bottom,
      above: slot.top - Math.max(list.bottom, ...rows),
      below: Math.min(...keys) - slot.bottom,
      keyTop: Math.min(...keys),
      glassBottom: glass?.bottom ?? null,
    };
  });
}

test('the history slot is fixed in height, empty on web, between the window and the keys', async ({ page }) => {
  await page.goto('/history?static=1');
  await expect(page.getByTestId('screen-history')).toBeVisible();
  const slot = page.getByTestId(SLOT);
  await expect(slot).toHaveCount(1);
  await expect(slot).toBeVisible();
  const first = (await slot.boundingBox())!;
  // The slot holds no ad on web: nothing inside it, and nothing that reads as one.
  expect(await slot.evaluate((e) => e.children.length)).toBe(0);
  expect(await slot.innerText()).toBe('');
  expect(await adsRequests(page)).toEqual([]);
  // Height: the anchored adaptive height for the device width. Full screen width.
  const width = page.viewportSize()!.width;
  const adaptive = Math.max(50, Math.round(width / 6.4));
  expect(Math.round(first.height)).toBe(adaptive);
  expect(Math.round(first.width)).toBe(width);
  expect(Math.round(first.x)).toBe(0);
  // Empty: plain housing paint. No seam, no frame, no tint, no opacity.
  const paint = await slot.evaluate((e) => {
    const c = getComputedStyle(e);
    return { border: c.borderTopWidth, bg: c.backgroundColor, opacity: c.opacity };
  });
  expect(paint).toEqual({ border: '0px', bg: 'rgba(0, 0, 0, 0)', opacity: '1' });

  const c = await slotClearance(page);
  console.log(`banner clearance (empty log): above ${c.above}, below ${c.below}, slot ${c.slotTop}-${c.slotBottom}, key top ${c.keyTop} at width ${width}`);
  expect(c.above).toBeGreaterThanOrEqual(CLEAR);
  expect(c.below).toBeGreaterThanOrEqual(CLEAR);
  // Between the window and the key row: the glass ends above the slot.
  expect(c.slotBottom).toBeLessThan(c.keyTop);

  // The slot does not move when other things settle: same box 600 ms later.
  await page.waitForTimeout(600);
  expect(await slot.boundingBox()).toEqual(first);
});

test('the key row stays where the viewfinder has it, with or without the slot', async ({ page }) => {
  await page.goto('/history?static=1');
  const y = (await page.getByTestId('key-forward').boundingBox())!.y;
  await page.goto('/viewfinder?static=1');
  expect((await page.getByTestId('key-capture').boundingBox())!.y).toBe(y);
  await page.goto('/settings?static=1');
  expect((await page.getByTestId('key-forward').boundingBox())!.y).toBe(y);
});

test('with real rows in the log the slot is 32 dp from every visible row and every key', async ({ page }) => {
  await page.goto('/history?static=1&log=demo3');
  const slot = page.getByTestId(SLOT);
  await expect(page.getByTestId('history-row-0003')).toBeVisible();
  const top = (await slot.boundingBox())!.y;
  const c = await slotClearance(page);
  const rowCount = await page.locator('[data-testid^="history-row-"]').count();
  console.log(`banner clearance with rows: slot top ${top}, above ${c.above}, below ${c.below}; ${rowCount} rows`);
  expect(rowCount).toBe(7);
  expect(c.above).toBeGreaterThanOrEqual(CLEAR);
  expect(c.below).toBeGreaterThanOrEqual(CLEAR);
  // Rows past the list's edge are clipped by the list, never drawn over the slot or the keys.
  const overflow = await page.getByTestId('history-list').evaluate((e) => getComputedStyle(e).overflowY);
  expect(['auto', 'scroll', 'hidden']).toContain(overflow);
  // No clear control exists in the log.
  await expect(page.getByTestId('key-clear')).toHaveCount(0);
});

test('consent denied: the slot is still there and still empty', async ({ page }) => {
  await page.goto('/history?static=1&consent=denied');
  await expect(page.getByTestId(SLOT)).toBeVisible();
  expect(await page.getByTestId(SLOT).evaluate((e) => e.children.length)).toBe(0);
});

async function adsRequests(page: Page) {
  return page.evaluate(() => (window.__adsLog ?? []).map((e) => e.call).filter((c) => /banner/i.test(c)));
}
