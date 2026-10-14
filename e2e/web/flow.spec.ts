import { expect, test } from '@playwright/test';

test('boot to viewfinder, scan, result and history', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  // static=1 freezes the viewfinder; speed=8 runs the real scan timeline in about a second.
  await page.goto('/?static=1&date=2026-10-13&speed=8');
  await page.getByTestId('key-acknowledge').click();
  await page.getByTestId('key-calib-unsure').click();

  const shot = (name: string) => page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/${name}.png` });

  await expect(page.getByTestId('screen-viewfinder')).toBeVisible();
  await expect(page.getByTestId('hud-flux')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
  await shot('viewfinder');
  await expect(page).toHaveScreenshot('viewfinder.png', { maxDiffPixels: 150 });

  // Capture runs the scan theatre, which saves the record and opens the result by itself.
  await page.getByTestId('key-capture').click();
  await expect(page.getByTestId('screen-scan')).toBeVisible();
  await shot('scan');

  await expect(page.getByTestId('screen-result')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('CASE 0001')).toBeVisible();
  await shot('result');
  await expect(page).toHaveScreenshot('result.png', { maxDiffPixels: 150 });

  // History is one tap from the viewfinder: back to it, then LOG.
  await page.getByTestId('screen-result').getByTestId('key-back').click();
  // The stack keeps the first viewfinder mounted behind the new one.
  await expect(page.getByTestId('screen-viewfinder').last()).toBeVisible();
  await page.getByTestId('key-log').last().click();
  await expect(page.getByTestId('screen-history')).toBeVisible();
  await shot('history');
  await expect(page).toHaveScreenshot('history.png', { maxDiffPixels: 150 });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

// One activity index per session: the boot's number is the viewfinder's, not a second read of the clock.
test('boot and viewfinder show the same activity index', async ({ page }) => {
  await page.goto('/?static=1&date=2026-10-13&time=22:48');
  await expect(page.getByTestId('activity')).toContainText('ACT IDX 3/5');
  await page.getByTestId('key-acknowledge').click();
  await page.getByTestId('key-calib-unsure').click();
  await expect(page.getByTestId('screen-viewfinder')).toBeVisible();
  await expect(page.getByTestId('hud-top')).toContainText('IDX');
  await expect(page.getByTestId('hud-top')).toContainText('3/5');
});

// The judges saw 3/5 on the boot screen and 2/5 on the viewfinder: the two goldens used different
// clocks. Under ?static=1 both screens now read the same params (?date=&time=, else the harness
// clock), so a direct visit to either one prints one number.
for (const [query, index] of [
  ['static=1&date=2026-10-13&time=22:48', '3/5'],
  ['static=1&date=2026-10-13', '2/5'],
  ['static=1', '2/5'],
] as const) {
  test(`boot and viewfinder print the same index under ?${query}`, async ({ page }) => {
    await page.goto(`/?${query}`);
    await expect(page.getByTestId('activity')).toContainText(`ACT IDX ${index}`);
    await page.goto(`/viewfinder?${query}`);
    await expect(page.getByTestId('hud-top')).toContainText(`IDX ${index}`);
  });
}
