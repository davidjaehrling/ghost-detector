import { expect, test } from '@playwright/test';

test('boot screen renders', async ({ page }, testInfo) => {
  await page.goto('/');
  const boot = page.locator('[data-testid="boot-screen"]');
  await boot.waitFor();
  await expect(page.getByText('FIELD UNIT').first()).toBeVisible();
  await page.screenshot({
    path: `e2e/screenshots/current/${testInfo.project.name}/boot.png`,
    fullPage: true,
  });
  await expect(page).toHaveScreenshot('boot.png', { maxDiffPixelRatio: 0.01 });
});
