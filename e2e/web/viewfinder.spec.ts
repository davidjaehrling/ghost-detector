import { expect, test } from '@playwright/test';

// Goldens: the viewfinder with the cellar fixture (default) and the bright
// fixture. ?static=1 freezes the flux walk and the needle. The clock is the boot golden's
// (?date=2026-10-13&time=22:48), so both screens print the same session index (3/5).
const CLOCK = 'date=2026-10-13&time=22:48';
for (const [name, query] of [
  ['viewfinder-cellar', `static=1&fixture=cellar&${CLOCK}`],
  ['viewfinder-bright', `static=1&fixture=bright&${CLOCK}`],
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
    await expect(page.getByTestId('hud-top')).toContainText('3/5');
    // The feed is a Skia canvas through the glass tint; wait for its first draw.
    await page.getByTestId('hud-feed').locator('canvas').waitFor();
    await expect(page.getByTestId('key-capture')).toBeVisible();
    await expect(page.getByTestId('key-capture')).toBeEnabled();
    // The needle and its trail are a Skia canvas on the dial plate.
    await expect(page.getByTestId('emf-needle').locator('canvas')).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() =>
      Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0),
    );
    // The radar sweep is frozen under ?static=1: the same angle 500 ms apart, and its canvas is there.
    const sweep = page.getByTestId('hud-sweep');
    await expect(sweep.locator('canvas')).toHaveCount(1);
    await expect(sweep).toHaveAttribute('aria-valuetext', '52 deg');
    await page.waitForTimeout(500);
    await expect(sweep).toHaveAttribute('aria-valuetext', '52 deg');
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
  await expect(page.getByTestId('tag-text-hallway')).toHaveText('HALL');
  await expect(page.getByTestId('tag-text-outdoors')).toHaveText('OUTSIDE');
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
  test.setTimeout(60_000);
  await page.goto('/viewfinder?fixture=cellar');
  const flux = page.getByTestId('hud-flux');
  await expect(flux).toBeVisible();
  // The canvases are WebGL (toDataURL reads back blank) and a screenshot is slow under load, so the
  // angle each one draws is read from its accessibility value.
  const angle = (id: string) => page.getByTestId(id).getAttribute('aria-valuetext');
  const needle0 = await angle('emf-needle');
  const sweep0 = await angle('hud-sweep');
  const flux0 = await flux.getAttribute('aria-label');
  await expect.poll(() => flux.getAttribute('aria-label'), { timeout: 10_000 }).not.toBe(flux0);
  await expect.poll(() => angle('emf-needle'), { timeout: 10_000 }).not.toBe(needle0);
  // The sweep turns on its own clock.
  await expect.poll(() => angle('hud-sweep'), { timeout: 10_000 }).not.toBe(sweep0);
});

// Selected tag (A-24): inverse video, n0 text on a p4 block. The others are p3 text with no block and no rule.
test('the selected tag is inverse video: n0 on a p4 block', async ({ page }) => {
  await page.goto('/viewfinder?static=1&fixture=cellar');
  await expect(page.getByTestId('tag-block')).toHaveCount(1);
  await expect(page.getByTestId('tag-underline')).toHaveCount(0);
  const on = page.getByTestId('tag-text-cellar');
  expect(await on.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(10, 15, 11)');
  expect(await on.evaluate((e) => getComputedStyle(e).textDecorationLine)).toBe('none');
  expect(await page.getByTestId('tag-block').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(124, 232, 149)');
  const block = (await page.getByTestId('tag-block').boundingBox())!;
  const text = (await on.boundingBox())!;
  expect(block.x).toBeLessThanOrEqual(text.x);
  expect(block.x + block.width).toBeGreaterThanOrEqual(text.x + text.width);
  expect(block.y).toBeLessThanOrEqual(text.y);
  expect(block.y + block.height).toBeGreaterThanOrEqual(text.y + text.height);
  const off = page.getByTestId('tag-text-attic');
  expect(await off.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(79, 180, 106)');
  await page.getByTestId('tag-attic').click();
  await expect(page.getByTestId('tag-block')).toHaveCount(1);
  expect(await page.getByTestId('tag-text-attic').evaluate((e) => getComputedStyle(e).color)).toBe('rgb(10, 15, 11)');
  expect(await page.getByTestId('tag-text-cellar').evaluate((e) => getComputedStyle(e).color)).toBe('rgb(79, 180, 106)');
});

// A-23: the 03:00 window in the top strip, right-aligned beside IDX, minutes only, held while the screen is up.
test('the 03:00 window countdown sits right-aligned in the top strip and does not tick', async ({ page }) => {
  await page.goto('/viewfinder?static=1&fixture=cellar');
  const win = page.getByTestId('hud-window');
  await expect(win).toHaveText(/^03:00 IN \d+ H \d+ MIN$/);
  expect(await win.innerText()).not.toMatch(/\d:\d\d:\d\d|\bS\b/);
  const [w, top, idx] = await Promise.all([win.boundingBox(), page.getByTestId('hud-top').boundingBox(), page.getByTestId('hud-top').boundingBox()]);
  const vw = page.viewportSize()!.width;
  expect(w!.y).toBeLessThan(top!.y + 30);
  expect(w!.x).toBeGreaterThan(idx!.x + idx!.width);
  expect(w!.x + w!.width).toBeGreaterThan(vw / 2);
  const first = await win.innerText();
  await page.waitForTimeout(1300);
  expect(await win.innerText()).toBe(first);
  // Never on the result.
  await page.goto('/result/demo?static=1&fixture=cellar&demo=active');
  await expect(page.getByTestId('screen-result')).toBeVisible();
  await expect(page.getByTestId('hud-window')).toHaveCount(0);
});

// ΔT is the live digit beside FLUX (in the flux block, not in the top corner).
test('the live ΔT sits with FLUX, frozen under static and moving live', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/viewfinder?static=1&fixture=cellar');
  const dt = page.getByTestId('hud-dt');
  await expect(dt).toHaveText(/^ΔT\s*-?\d+\.\d\s?°C$/);
  await expect(page.getByTestId('hud-top')).not.toContainText('ΔT');
  const flux = (await page.getByTestId('hud-flux').boundingBox())!;
  const geo = (await page.getByTestId('hud-geo').boundingBox())!;
  const box = (await dt.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(flux.y + flux.height - 2);
  const vw = page.viewportSize()!.width;
  if (vw < 380) {
    // A narrow window: ΔT takes its own line under GEO, with the spaces of the unit format intact (A-26).
    expect(box.y).toBeGreaterThanOrEqual(geo.y + geo.height - 2);
    await expect(dt).toHaveText(/^ΔT -?\d+\.\d °C$/);
  } else {
    expect(box.x).toBeGreaterThan(geo.x + geo.width);
  }
  // Never under the gauge plate, at any width (360 px used to clip the C).
  const dial = (await page.getByTestId('hud-dial').boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(dial.x + 1);
  await expect(dt).toHaveText(/°C$/);
  const first = await dt.innerText();
  await page.waitForTimeout(1300);
  expect(await dt.innerText()).toBe(first);

  await page.goto('/viewfinder?fixture=cellar');
  const live = page.getByTestId('hud-dt');
  await expect(live).toBeVisible();
  const seen = new Set<string>();
  const until = Date.now() + 12_000;
  while (Date.now() < until && seen.size < 3) {
    seen.add((await live.innerText()).replace(/\s+/g, ' '));
    await page.waitForTimeout(250);
  }
  expect(seen.size).toBeGreaterThanOrEqual(2);
  // Whole tenths, in the live range.
  for (const v of seen) {
    const n = Number(/(-?\d+\.\d)/.exec(v)![1]);
    expect(n).toBeGreaterThanOrEqual(-12);
    expect(n).toBeLessThanOrEqual(6);
  }
});

// The engraved dummy caps carry no legend, no dash and no dots.
test('dummy keys are blank engraved caps', async ({ page }) => {
  await page.goto('/viewfinder?static=1&fixture=cellar');
  const dummies = page.getByTestId('key-dummy');
  await expect(dummies).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    expect(((await dummies.nth(i).innerText()) ?? '').trim()).toBe('');
    const box = (await dummies.nth(i).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(72);
  }
});
