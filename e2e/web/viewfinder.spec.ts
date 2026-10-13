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
    // The needle and its trail are a Skia canvas on the dial plate.
    await expect(page.getByTestId('emf-needle').locator('canvas')).toHaveCount(1);
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

test('the tag row is controlled by the glass row only, with 44 dp hits and 12 px gaps', async ({ page }) => {
  await page.goto('/viewfinder?static=1&fixture=cellar');
  await expect(page.getByTestId('hud-lore')).toContainText('Cellars hold cold air.');
  // Slot 1 is a dummy cap now: no key carries the tag.
  await expect(page.getByTestId('key-tag')).toHaveCount(0);
  const tags = ['cellar', 'attic', 'bedroom', 'hallway', 'outdoors'] as const;
  const hits = [];
  const texts = [];
  for (const t of tags) {
    hits.push((await page.getByTestId(`tag-${t}`).boundingBox())!);
    texts.push((await page.getByTestId(`tag-text-${t}`).boundingBox())!);
  }
  for (const b of hits) {
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBeGreaterThanOrEqual(44);
  }
  for (let i = 1; i < tags.length; i++) {
    expect(texts[i]!.x - (texts[i - 1]!.x + texts[i - 1]!.width)).toBeGreaterThanOrEqual(12);
    expect(hits[i]!.x - (hits[i - 1]!.x + hits[i - 1]!.width)).toBeGreaterThanOrEqual(12 - 0.1);
  }
  const vw = page.viewportSize()!.width;
  await expect(page.getByTestId('tag-text-hallway')).toHaveText(vw < 380 ? 'HALL' : 'HALLWAY');
  await expect(page.getByTestId('tag-text-outdoors')).toHaveText(vw < 380 ? 'OUTSIDE' : 'OUTDOORS');
  await page.getByTestId('tag-attic').click();
  await expect(page.getByTestId('hud-lore')).toContainText('Attic timber settles after dusk.');
  for (const t of ['bedroom', 'hallway', 'outdoors', 'cellar'] as const) await page.getByTestId(`tag-${t}`).click();
  // A scan with the tag marks it seen: the note does not come back for that tag.
  await page.getByTestId('key-capture').click();
  await expect(page.getByTestId('screen-scan')).toBeVisible();
  await page.getByTestId('key-cancel').click();
  await expect(page.getByTestId('screen-viewfinder')).toBeVisible();
  await expect(page.getByTestId('hud-lore')).toHaveCount(0);
  const seen = await page.evaluate(() => localStorage.getItem('fs4.tags-seen.v1'));
  expect(seen).toBe('["cellar"]');
});

test('one opaque band runs edge to edge to the glass bottom, FLUX and GEO share the ladder', async ({ page }) => {
  await page.goto('/viewfinder?static=1&fixture=bright');
  await expect(page.getByTestId('hud-band')).toBeVisible();
  const band = (await page.getByTestId('hud-band').boundingBox())!;
  const top = (await page.getByTestId('hud-top').boundingBox())!;
  expect(band.y).toBeGreaterThan(top.y);
  const bg = await page.getByTestId('hud-band').evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(bg).toBe('rgb(10, 15, 11)');
  // Bottom edge of the band is the bottom of the glass (the key band starts a margin below).
  const tagBottom = (await page.getByTestId('tag-cellar').boundingBox())!;
  expect(tagBottom.y).toBeGreaterThanOrEqual(band.y - 1);
  const gap = await page.getByTestId('hud-band').evaluate((e) => {
    const glass = e.parentElement!.getBoundingClientRect();
    const b = e.getBoundingClientRect();
    return { bottom: glass.bottom - b.bottom, left: b.left - glass.left, right: glass.right - b.right };
  });
  expect(Math.abs(gap.bottom)).toBeLessThanOrEqual(2);
  expect(Math.abs(gap.left)).toBeLessThanOrEqual(2);
  expect(Math.abs(gap.right)).toBeLessThanOrEqual(2);
  await expect(page.getByTestId('hud-geo')).toHaveText(/^GEO [+-]\d+%$/);
  const flux = await page.getByTestId('hud-flux').getAttribute('aria-label');
  expect(flux).toMatch(/^FLUX +\d+ mG$/);
});

// Web has no magnetometer: the seeded walk drives the flux and the needle, and moves without ?static=1.
test('the seeded walk moves the flux and redraws the needle on web', async ({ page }) => {
  await page.goto('/viewfinder?fixture=cellar');
  const flux = page.getByTestId('hud-flux');
  await expect(flux).toBeVisible();
  // Pixels, not toDataURL: the Skia canvas is WebGL and reads back blank.
  const needle = page.getByTestId('emf-needle');
  const pixels = async () => (await needle.screenshot()).toString('base64');
  const before = { flux: await flux.getAttribute('aria-label'), pixels: await pixels() };
  await expect.poll(async () => flux.getAttribute('aria-label'), { timeout: 5000 }).not.toBe(before.flux);
  await expect.poll(pixels, { timeout: 5000 }).not.toBe(before.pixels);
});
