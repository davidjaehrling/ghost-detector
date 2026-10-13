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

test('location tag key steps through the tags and the lore note shows once per tag', async ({ page }) => {
  await page.goto('/viewfinder?static=1&fixture=cellar');
  await expect(page.getByTestId('key-tag')).toHaveText('CELLAR');
  await expect(page.getByTestId('hud-lore')).toContainText('Cellars hold cold air.');
  await page.getByTestId('key-tag').click();
  await expect(page.getByTestId('key-tag')).toHaveText('ATTIC');
  await expect(page.getByTestId('hud-lore')).toContainText('Attic timber settles after dusk.');
  for (const name of ['BEDROOM', 'HALLWAY', 'OUTDOORS', 'CELLAR']) {
    await page.getByTestId('key-tag').click();
    await expect(page.getByTestId('key-tag')).toHaveText(name);
  }
  // A scan with the tag marks it seen: the note does not come back for that tag.
  await page.getByTestId('key-capture').click();
  await expect(page.getByTestId('screen-scan')).toBeVisible();
  await page.getByTestId('key-cancel').click();
  await expect(page.getByTestId('screen-viewfinder')).toBeVisible();
  await expect(page.getByTestId('key-tag')).toHaveText('CELLAR');
  await expect(page.getByTestId('hud-lore')).toHaveCount(0);
  const seen = await page.evaluate(() => localStorage.getItem('fs4.tags-seen.v1'));
  expect(seen).toBe('["cellar"]');
});
