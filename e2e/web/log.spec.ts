import { expect, test } from '@playwright/test';

// P6-03. The investigation log: empty state, three tags, case rows, a reopened case.

const DEMO = '/history?static=1&log=demo3';

test('empty log', async ({ page }) => {
  await page.goto('/history?static=1');
  await expect(page.getByTestId('screen-history')).toBeVisible();
  await expect(page.getByText('No cases logged. Run CAPTURE on the viewfinder.')).toBeVisible();
  // NIGHTS LOGGED hides while it reads 0.
  await expect(page.getByTestId('history-nights')).toHaveCount(0);
  await expect(page.getByTestId('history-catalogue-head')).toHaveText('CATALOGUE 0/24');
  // Collapsed to its header: no class rows while there are no records.
  await expect(page.locator('[data-testid^="history-cat-"]:not([data-testid="history-catalogue-head"])')).toHaveCount(0);
  // The empty readout sits above the catalogue header.
  const [readout, head] = await Promise.all([page.getByTestId('history-empty').boundingBox(), page.getByTestId('history-catalogue-head').boundingBox()]);
  expect(readout!.y + readout!.height).toBeLessThanOrEqual(head!.y);
  await expect(page.getByTestId('key-viewfinder')).toBeVisible();
  await expect(page.getByTestId('history-moons')).toHaveCount(0);
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
  expect(await label('attic')).toBe('ATTIC · 2 CASES · PEAK 94 CRITICAL · 2026-10-12 21:30');
  expect(await label('bedroom')).toMatch(/^BEDROOM · 2 CASES · PEAK \d+ \w+ · 2026-10-\d\d \d\d:\d\d$/);
  // Case rows: ID, SPI, tier; UNRESOLVED only where a Deep Scan is still open.
  const strong = page.getByTestId('history-row-0003');
  await expect(strong).toContainText('0003 · 80 STRONG 22:48');
  await expect(strong).toContainText(/UNRESOLVED \d+%/);
  await expect(page.getByTestId('history-row-0001')).not.toContainText('UNRESOLVED');
  // A declined rewarded ad archives the case: ARCHIVED replaces UNRESOLVED, same percent.
  const declined = page.getByTestId('history-row-0006');
  await expect(declined).toContainText('0006 · ');
  await expect(declined).toContainText(/ARCHIVED \d+%/);
  await expect(declined).not.toContainText('UNRESOLVED');
  // A reading surface: no DEEP SCAN key, no streak, badge or countdown wording.
  const body = (await page.getByTestId('screen-history').innerText()).toUpperCase();
  for (const w of ['DEEP SCAN', 'STREAK', 'BADGE', 'EXPIRE', 'COME BACK', 'MISSED']) expect(body).not.toContain(w);
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('history-3tags.png', { maxDiffPixels: 150 });
});

test('every case row keeps one line, status in a fixed right column', async ({ page }) => {
  await page.goto(DEMO);
  const rows = page.locator('[data-testid^="history-row-"]');
  await expect(page.getByTestId('history-row-0001')).toBeVisible();
  const n = await rows.count();
  expect(n).toBeGreaterThanOrEqual(6);
  const statusX = new Set<number>();
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    const info = await row.evaluate((e) => {
      const lines = new Set<number>();
      for (const t of Array.from(e.querySelectorAll('div,span'))) {
        if (t.children.length > 0 && t.querySelector('div,span')) continue;
        const r = document.createRange();
        r.selectNodeContents(t);
        for (const q of Array.from(r.getClientRects())) lines.add(Math.round(q.top / 4));
      }
      const box = e.getBoundingClientRect();
      const kids = Array.from(e.children) as HTMLElement[];
      const last = kids[kids.length - 1]!.getBoundingClientRect();
      return { h: box.height, right: Math.round(last.right), kids: kids.length, lines: lines.size };
    });
    expect(info.h, await row.innerText()).toBeLessThan(44);
    // No truncation: the case text shows in full (the clock is never cut to an ellipsis).
    const clipped = await row.evaluate((e) => Array.from(e.querySelectorAll('div,span')).some((t) => (t as HTMLElement).scrollWidth > (t as HTMLElement).clientWidth + 1));
    expect(clipped, await row.innerText()).toBe(false);
    if (info.kids > 1) statusX.add(info.right);
  }
  expect(statusX.size).toBe(1);
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

test('empty state: a VIEWFINDER key in slot 1 opens the viewfinder', async ({ page }) => {
  await page.goto('/history?static=1');
  const key = page.getByTestId('key-viewfinder');
  await expect(key).toBeVisible();
  const [k, settings] = await Promise.all([key.boundingBox(), page.getByTestId('key-forward').boundingBox()]);
  expect(k!.x).toBeLessThan(settings!.x - 100);
  await key.click();
  await expect(page.getByTestId('screen-viewfinder')).toBeVisible();
  // On a non-empty log the key is gone.
  await page.goto(DEMO);
  await expect(page.getByTestId('key-viewfinder')).toHaveCount(0);
});

test('catalogue: one row per class, UNLOGGED until a Deep Scan, never "unconfirmed"', async ({ page }) => {
  await page.goto(DEMO);
  const head = page.getByTestId('history-catalogue-head');
  await expect(head).toHaveText(/^CATALOGUE \d+\/24$/);
  await expect(page.locator('[data-testid^="history-cat-"]:not([data-testid="history-catalogue-head"])')).toHaveCount(24);
  const rows = await page.locator('[data-testid^="history-cat-"]:not([data-testid="history-catalogue-head"])').allInnerTexts();
  const logged = rows.filter((r) => /LOGGED · \d{4}/.test(r) && !/UNLOGGED/.test(r)).length;
  expect(rows.filter((r) => r.includes('UNLOGGED')).length + logged).toBe(24);
  await expect(head).toHaveText(`CATALOGUE ${logged}/24`);
  expect((await page.getByTestId('screen-history').innerText()).toLowerCase()).not.toContain('unconfirmed');
});

test('moon table: seven nights, index 1 to 5, relay row opens settings', async ({ page }) => {
  await page.goto(DEMO);
  const rows = page.locator('[data-testid^="history-moon-"]');
  await expect(rows).toHaveCount(7);
  const texts = await rows.allInnerTexts();
  for (const t of texts) {
    const m = /^(\d{4}-\d\d-\d\d)\s+(\d+)% · ([1-5])\/5$/.exec(t.replace(/\n/g, ' ').trim());
    expect(m, t).not.toBeNull();
  }
  expect(texts[0]).toContain('2026-10-13');
  expect(texts[6]).toContain('2026-10-19');
  await expect(page.getByTestId('history-moon')).toContainText('IDX AT 22:00');
  await expect(page.getByTestId('history-next-moon')).toHaveText(/^NEXT FULL MOON \d{4}-\d\d-\d\d$/);
  // FULL MOONS LOGGED hides at 0 (the demo log has no case in a full-moon window).
  await expect(page.getByTestId('history-moons')).toHaveCount(0);
  await expect(page.getByTestId('history-relay')).toHaveText('FIELD LOG RELAY: OFF');
  await page.getByTestId('history-relay').scrollIntoViewIfNeeded();
  await page.getByTestId('history-relay').click();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
});

test('CRITICAL is red in the log, other tier words are not', async ({ page }) => {
  await page.goto(DEMO);
  const colour = (id: string, word: string) =>
    page.getByTestId(id).evaluate((e, w) => {
      const n = Array.from(e.querySelectorAll('*')).find((x) => x.children.length === 0 && x.textContent === w) as HTMLElement;
      return getComputedStyle(n).color;
    }, word);
  expect(await colour('history-row-0004', 'CRITICAL')).toBe('rgb(255, 74, 58)');
  expect(await colour('history-row-0003', 'STRONG')).not.toBe('rgb(255, 74, 58)');
});

test('FULL MOONS LOGGED is a stored count: shows from 1, never falls with the records gone', async ({ page }) => {
  await page.goto('/history?static=1');
  await page.evaluate(() => localStorage.setItem('fs4.moons.v1', JSON.stringify([310, 311])));
  await page.reload();
  await expect(page.getByTestId('history-moons')).toHaveText('FULL MOONS LOGGED 2');
  await expect(page.getByTestId('history-nights')).toHaveCount(0);
});
