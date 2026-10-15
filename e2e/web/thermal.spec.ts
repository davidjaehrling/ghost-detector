import { waitPixelsStable } from './stable';
import { expect, test } from '@playwright/test';

// P3-05: thermal view in the result screen's 318 x 303 photo panel, PH-WHT palette, cold spot
// with its ΔT readout, FLIR-style scale bar. Goldens at 390 only, critical tier.
for (const fixture of ['cellar', 'bright'] as const) {
  test(`thermal view on ${fixture}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'android-390x844', 'golden at 390 only');
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto(`/thermal-probe?static=1&fixture=${fixture}&tier=critical`);
    const view = page.getByTestId('thermal-view');
    await view.waitFor();
    await expect(view.locator('canvas')).toHaveCount(1);
    // The readout is Skia text inside the canvas; its string is mirrored in the view's label.
    await expect(page.getByRole('img', { name: /SP1 ΔT -9\.0 °C/ })).toBeVisible();
    // Fonts load asynchronously into Skia; give the canvas a couple of frames after that.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await waitPixelsStable(view);
    await expect(view).toHaveScreenshot(`thermal-${fixture}.png`, { maxDiffPixels: 400 });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
