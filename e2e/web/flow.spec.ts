import { expect, test } from '@playwright/test';

test('boot to viewfinder, scan, result and history', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/?static=1&date=2026-10-13');
  await page.getByTestId('key-acknowledge').click();

  const steps = ['viewfinder', 'scan', 'result', 'history'] as const;
  for (const [i, name] of steps.entries()) {
    const screen = page.getByTestId(`screen-${name}`);
    await expect(screen).toBeVisible();
    await page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/${name}.png` });
    await expect(page).toHaveScreenshot(`${name}.png`, { maxDiffPixels: 150 });
    if (i < steps.length - 1) await screen.getByTestId('key-forward').click();
  }

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
