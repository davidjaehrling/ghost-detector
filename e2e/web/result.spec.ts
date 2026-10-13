import { expect, test } from '@playwright/test';

// ?static=1&demo=quiet|active|critical builds the record from a fixed seed
// (src/ui/result/demo.ts) over the cellar fixture, so the picture is the same
// on every run. Reveal, jitter and the not-fitted timer are frozen under static.
const DEMOS = [
  { demo: 'quiet', tier: 'QUIET' },
  { demo: 'active', tier: 'ACTIVE' },
  { demo: 'critical', tier: 'CRITICAL' },
] as const;

function watch(page: import('@playwright/test').Page) {
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

async function settle(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('result-photo')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
}

for (const { demo, tier } of DEMOS) {
  test(`result ${demo}`, async ({ page }, testInfo) => {
    const check = watch(page);
    await page.goto(`/result/demo?static=1&fixture=cellar&demo=${demo}`);
    await expect(page.getByTestId('screen-result')).toBeVisible();
    await settle(page);
    await expect(page.getByTestId('result-tier')).toHaveText(tier);
    await expect(page.getByTestId('key-share')).toBeVisible();
    if (demo === 'quiet') {
      // DEEP SCAN is a dummy cap on QUIET and TRACE: nothing to decode, no offer.
      await expect(page.getByTestId('key-deepscan')).toHaveCount(0);
      await expect(page.getByTestId('result-offer')).toHaveCount(0);
      await expect(page.getByTestId('result-profile').getByText('NO SIGNATURE')).toBeVisible();
      await expect(page.getByTestId('ghost-v0')).toHaveCount(0);
    } else {
      await expect(page.getByTestId('key-deepscan')).toBeVisible();
      await expect(page.getByTestId('result-offer')).toHaveText('Run DEEP SCAN to resolve designation, behaviour and EVP.');
      await expect(page.getByTestId('result-decoded')).toContainText('SIGNATURE PARTIALLY DECODED:');
      await expect(page.getByTestId('profile-mask')).toHaveCount(3);
      await expect(page.getByTestId('ghost-v0')).toHaveCount(1);
    }
    // The key row is one fixed grid: four 72 px slots at the same x on every screen.
    const xs = await page.locator('[data-testid^="key-"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)));
    expect(new Set(xs).size).toBe(xs.length);
    await page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/result-${demo}.png` });
    await expect(page).toHaveScreenshot(`result-${demo}.png`, { maxDiffPixels: 150 });
    check();
  });
}

test('inert keys show one line and no ad surface exists', async ({ page }) => {
  const check = watch(page);
  await page.goto('/result/demo?static=1&fixture=cellar&demo=active');
  await settle(page);
  await expect(page.getByTestId('result-line')).toHaveText('Activity logged.');
  await page.getByTestId('key-deepscan').click();
  await expect(page.getByTestId('result-line')).toHaveText('NOT FITTED IN THIS UNIT');
  check();
});

test('a missing case shows NO RECORD and a way back', async ({ page }) => {
  const check = watch(page);
  await page.goto('/result/9999?static=1');
  await expect(page.getByTestId('result-missing')).toBeVisible();
  await expect(page.getByText('NO RECORD')).toBeVisible();
  await page.getByTestId('key-back').click();
  await expect(page.getByTestId('screen-viewfinder')).toBeVisible();
  check();
});
