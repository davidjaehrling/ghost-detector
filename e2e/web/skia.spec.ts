import { expect, test } from '@playwright/test';

// P3-01: CanvasKit loads from the static export and a Skia canvas (graticule, trace, runtime
// shader grain over FractalNoise) renders deterministically under ?static=1.
test('skia probe renders on CanvasKit', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/probe?static=1');
  const probe = page.getByTestId('skia-probe');
  await probe.waitFor();
  await expect(probe.locator('canvas')).toHaveCount(1);
  expect(await page.evaluate(() => typeof (globalThis as { CanvasKit?: unknown }).CanvasKit)).toBe('object');
  // Skia paints on a frame after mount; toHaveScreenshot then waits for two matching captures.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(probe).toHaveScreenshot('skia-probe.png', { maxDiffPixels: 150 });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
