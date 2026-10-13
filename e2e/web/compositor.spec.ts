import { expect, test } from '@playwright/test';

// P3-04: compositor v1 on the probe route (src/fx/compositor/CompositeProbe.tsx), one golden per
// fixture at 390 x 844. The panel lays the photo out as the result screen does and places the
// figure with placeGhost; the seed depends on the fixture, so the five goldens show different
// variants. Goldens are tolerant (SwiftShader on CI): blur, noise and grain vary by a few pixels.
const FIXTURES = ['cellar', 'attic', 'bright', 'black', 'outdoors'] as const;

for (const fixture of FIXTURES) {
  test(`composite ${fixture}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'android-390x844', 'goldens at 390 only');
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    const panel = page.getByTestId('composite-probe');
    const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

    await page.goto(`/composite-probe?static=1&fixture=${fixture}&demo=active&ghost=0`);
    await page.getByTestId('composite').waitFor();
    await frames();
    const without = await panel.screenshot();

    await page.goto(`/composite-probe?static=1&fixture=${fixture}&demo=active`);
    await page.getByTestId('composite').waitFor();
    await expect(panel.locator('canvas')).toHaveCount(1);
    await frames();
    // The ghost changes the picture (the measured lift is in scripts/measure-ghost.mjs).
    expect((await panel.screenshot()).equals(without)).toBe(false);
    await expect(panel).toHaveScreenshot(`composite-${fixture}.png`, { maxDiffPixels: 400 });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
