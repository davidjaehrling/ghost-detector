import { expect, test } from '@playwright/test';

// P6-01: the share card through the public renderShareCard on the web path (data URL), scaled to
// fit on /share-probe. Goldens at 390 only, Skia tolerance as the other Skia goldens.
for (const format of ['story', 'square'] as const) {
  test(`share card ${format}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'android-390x844', 'goldens at 390 only');
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/share-probe?static=1&format=${format}&case=critical-deep&fixture=cellar`);
    const cardEl = page.getByTestId('share-card');
    await cardEl.waitFor({ timeout: 60_000 });
    const src = await cardEl.locator('img').first().getAttribute('src');
    expect(src?.startsWith('data:image/png;base64,')).toBe(true);
    const size = await page.evaluate(
      (u) => new Promise<[number, number]>((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = u; }),
      src!,
    );
    expect(size).toEqual(format === 'story' ? [1080, 1920] : [1080, 1080]);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await expect(cardEl).toHaveScreenshot(`share-${format}.png`, { maxDiffPixels: 400 });
    expect(errors).toEqual([]);
  });
}
