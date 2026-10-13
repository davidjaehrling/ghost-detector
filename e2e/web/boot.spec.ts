import { expect, test } from '@playwright/test';

test('boot screen renders', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/');
  const boot = page.locator('[data-testid="boot-screen"]');
  await boot.waitFor();
  await expect(page.getByText('FIELD UNIT').first()).toBeVisible();
  await page.screenshot({
    path: `e2e/screenshots/current/${testInfo.project.name}/boot.png`,
    fullPage: false,
  });
  await expect(page).toHaveScreenshot('boot.png', { maxDiffPixels: 150 });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
