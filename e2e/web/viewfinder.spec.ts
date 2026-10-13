import { expect, test } from '@playwright/test';

// Goldens: the viewfinder with the cellar fixture (default) and the bright
// fixture. ?static=1 freezes the flux walk and the needle.
for (const [name, query] of [
  ['viewfinder-cellar', 'static=1&fixture=cellar'],
  ['viewfinder-bright', 'static=1&fixture=bright'],
] as const) {
  test(`viewfinder ${name}`, async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto(`/viewfinder?${query}`);
    await expect(page.getByTestId('screen-viewfinder')).toBeVisible();
    await expect(page.getByTestId('hud-flux')).toBeVisible();
    await expect(page.getByTestId('key-capture')).toBeVisible();
    await expect(page.getByTestId('key-capture')).toBeEnabled();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() =>
      Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0),
    );
    await page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/${name}.png` });
    await expect(page).toHaveScreenshot(`${name}.png`, { maxDiffPixels: 150 });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
