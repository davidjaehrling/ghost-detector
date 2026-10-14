import { expect, test, type Page } from '@playwright/test';

// P5-06. One banner slot, on the history screen only: absent on boot, viewfinder, scan, result and
// settings; present on history with a fixed height; 24 dp clear of the nearest control.

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

test('the history slot is fixed in height, empty on web, and 24 dp from the nearest control', async ({ page }) => {
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
  // Height: the anchored adaptive height for the device width plus the bottom inset (0 on web).
  const width = page.viewportSize()!.width;
  const adaptive = Math.max(50, Math.round(width / 6.4));
  expect(Math.round(first.height)).toBe(adaptive);
  expect(Math.round(first.width)).toBe(width);
  // It sits at the bottom of the screen.
  expect(Math.round(first.y + first.height)).toBe(page.viewportSize()!.height);

  // Gap: from the slot's top edge to the bottom of every button, row and control above it.
  const tappables = await page.locator('[data-testid^="key-"], [data-testid^="history-row"], [data-testid="key-clear"]').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { id: e.getAttribute('data-testid'), bottom: r.bottom };
    }),
  );
  expect(tappables.length).toBeGreaterThan(0);
  const nearest = Math.max(...tappables.map((t) => t.bottom));
  const gap = first.y - nearest;
  console.log(`banner gap: slot top ${first.y}, nearest control bottom ${nearest}, gap ${gap} px at width ${width}`);
  expect(gap).toBeGreaterThanOrEqual(24);

  // The slot does not move when other things settle: same box 600 ms later.
  await page.waitForTimeout(600);
  expect(await slot.boundingBox()).toEqual(first);
});

test('with real rows in the log the slot is 24 dp from every visible row and every key', async ({ page }) => {
  await page.goto('/history?static=1&log=demo3');
  const slot = page.getByTestId(SLOT);
  await expect(page.getByTestId('history-row-0003')).toBeVisible();
  const top = (await slot.boundingBox())!.y;
  const m = await page.evaluate(() => {
    const list = document.querySelector('[data-testid="history-list"]')!.getBoundingClientRect();
    const rows = Array.from(document.querySelectorAll('[data-testid^="history-row-"]')).map((e) => {
      const r = e.getBoundingClientRect();
      // A row scrolled past the clipped list is not on screen: measure what the list shows.
      return { id: e.getAttribute('data-testid'), bottom: Math.min(r.bottom, list.bottom), top: r.top };
    });
    const keys = Array.from(document.querySelectorAll('[data-testid^="key-"]')).map((e) => e.getBoundingClientRect().bottom);
    return { listBottom: list.bottom, rows, keys };
  });
  expect(m.rows.length).toBe(7);
  const nearest = Math.max(m.listBottom, ...m.rows.map((r) => r.bottom), ...m.keys);
  console.log(`banner gap with rows: slot top ${top}, nearest ${nearest}, gap ${top - nearest} px; ${m.rows.length} rows`);
  expect(top - nearest).toBeGreaterThanOrEqual(24);
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
