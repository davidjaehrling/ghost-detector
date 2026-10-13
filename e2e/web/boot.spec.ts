import { expect, test } from '@playwright/test';

test('boot screen renders', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/?static=1&date=2026-10-13&time=22:48');
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

  await page.goto('/?static=1&date=2026-10-13&time=22:48&calib=1');
  await page.locator('[data-testid="boot-screen"]').waitFor();
  await expect(page.getByTestId('calibration')).toBeVisible();
  await expect(page.getByTestId('calibration-question')).toHaveText(/Have you ever experienced\s*something you couldn't\s*explain\?/);
  await expect(page.getByTestId('calibration-cursor')).toBeVisible();
  for (const id of ['key-calib-yes', 'key-calib-unsure', 'key-calib-no', 'key-calib-skip']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  // No boxed card: the block has no border. SKIP is a small glass target, slot 4 a dummy cap.
  const border = await page.getByTestId('calibration').evaluate((e) => getComputedStyle(e).borderTopWidth);
  expect(border).toBe('0px');
  await expect(page.getByTestId('key-calib-skip')).toHaveText('SKIP');
  const skip = (await page.getByTestId('key-calib-skip').boundingBox())!;
  expect(skip.width).toBeLessThan(72);
  const keyCount = await page.locator('[data-testid^="key-calib-"]').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width >= 72).length);
  expect(keyCount).toBe(3);
  // The sticker keeps its full size; only its top third shows above the glass bottom.
  const sticker = (await page.getByTestId('sticker').boundingBox())!;
  const glass = await page.getByTestId('sticker').evaluate((e) => e.parentElement!.getBoundingClientRect().bottom);
  expect(sticker.height).toBeGreaterThan(100);
  const shown = glass - sticker.y;
  expect(shown).toBeGreaterThan(sticker.height * 0.25);
  expect(shown).toBeLessThan(sticker.height * 0.45);
  await expect(page.getByTestId('countdown')).toHaveText('03:00 WINDOW IN 4 H 12 MIN');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/boot-calib.png` });
  await expect(page).toHaveScreenshot('boot-calib.png', { maxDiffPixels: 150 });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('the nameplate serial shortens under 380 px and the activity digit lights at 3', async ({ page }) => {
  await page.goto('/?static=1&date=2026-10-13&time=22:48');
  await page.locator('[data-testid="boot-screen"]').waitFor();
  const vw = page.viewportSize()!.width;
  await expect(page.getByText(vw < 380 ? /^00417-9$/ : /^FS4-8711-00417-9$/).first()).toBeVisible();
  // One serial rule: the full number is printed exactly once, on the plate (wide) or the sticker (narrow).
  await expect(page.getByText(/FS4-8711-00417-9/)).toHaveCount(1);
  await expect(page.getByTestId('activity')).toContainText('ACT IDX 3/5');
  const colour = await page.getByTestId('activity').locator('span').first().evaluate((e) => getComputedStyle(e).color);
  expect(colour).toBe('rgb(212, 255, 220)');
  await expect(page.getByTestId('countdown')).toHaveText('03:00 WINDOW IN 4 H 12 MIN');
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
