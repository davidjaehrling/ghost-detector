import { expect, test, type Page } from '@playwright/test';

// P3-02: the glass stack over plain RN content (/probe?layer=overlay) and the barrel warp of a
// snapshot (/probe?layer=warp), deterministic under ?static=1. One viewport is enough for a
// probe; the tolerance absorbs SwiftShader noise in headless Chromium.
test.skip(({ viewport }) => viewport?.width !== 390, 'glass probe goldens run at 390 only');

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

test('glass overlay over RN views', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/probe?static=1&layer=overlay');
  const probe = page.getByTestId('skia-probe');
  await probe.waitFor();
  // Static layers, grain, burn-in: three canvases over the sample view.
  await expect(probe.locator('canvas')).toHaveCount(3);
  await settle(page);
  await expect(probe).toHaveScreenshot('glass-overlay.png', { maxDiffPixels: 400 });
  // The overlay must not take touches from the views beneath it.
  const box = (await probe.boundingBox())!;
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.tagName ?? '', [box.x + box.width / 2, box.y + 60]);
  expect(hit).not.toBe('CANVAS');
  expect(errors).toEqual([]);
});

test('glass warp bends a snapshot of RN views', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/probe?static=1&layer=warp');
  const probe = page.getByTestId('skia-probe');
  await page.getByTestId('skia-probe-warp-warped').waitFor();
  await settle(page);
  await expect(probe).toHaveScreenshot('glass-warp.png', { maxDiffPixels: 400 });
  expect(errors).toEqual([]);
});

test('phosphor text and settled trail render', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/probe?static=1&layer=phosphor');
  const probe = page.getByTestId('skia-probe');
  await probe.waitFor();
  await expect(probe.locator('canvas')).toHaveCount(4);
  await settle(page);
  expect(errors).toEqual([]);
});
