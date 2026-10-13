import { expect, test } from '@playwright/test';

test('boot screen renders', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/?static=1&date=2026-10-13');
  const boot = page.locator('[data-testid="boot-screen"]');
  await boot.waitFor();
  await expect(page.getByText('SELFTEST OK')).toBeVisible();
  await expect(page.getByText('This unit detects nothing.')).toBeVisible();
  await page.screenshot({
    path: `e2e/screenshots/current/${testInfo.project.name}/boot.png`,
    fullPage: false,
  });
  await expect(page).toHaveScreenshot('boot.png', { maxDiffPixels: 150 });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

// ?calib=1 opens on the belief-calibration card. Keys are YES / NOT SURE / NO / SKIP.
test('boot calibration card renders', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/?static=1&date=2026-10-13&calib=1');
  await page.locator('[data-testid="boot-screen"]').waitFor();
  await expect(page.getByTestId('calibration')).toBeVisible();
  await expect(page.getByText("Have you ever experienced something you couldn't explain?")).toBeVisible();
  for (const id of ['key-calib-yes', 'key-calib-unsure', 'key-calib-no', 'key-calib-skip']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/boot-calib.png` });
  await expect(page).toHaveScreenshot('boot-calib.png', { maxDiffPixels: 150 });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('calibration answer sets the intensity, confirms, then opens the viewfinder once', async ({ page }) => {
  await page.goto('/?static=1&date=2026-10-13');
  await page.getByTestId('key-acknowledge').click();
  await page.getByTestId('key-calib-no').click();
  await expect(page.getByTestId('calibration-note')).toHaveText('Intensity set to BRAVE. Change any time in Settings.');
  await expect(page.getByTestId('screen-viewfinder')).toBeVisible();
  const stored = await page.evaluate(() => [localStorage.getItem('fs4.belief.v1'), localStorage.getItem('fs4.intensity.v1')]);
  expect(stored).toEqual(['no', 'brave']);
  // Asked once: the next ACKNOWLEDGE goes straight on.
  await page.goto('/?static=1&date=2026-10-13');
  await page.getByTestId('key-acknowledge').click();
  await expect(page.getByTestId('screen-viewfinder')).toBeVisible();
});
