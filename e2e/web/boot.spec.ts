import { expect, test } from '@playwright/test';
import { waitWarped } from './warped';

test('boot screen renders', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/?static=1&date=2026-10-13&time=22:48');
  const boot = page.locator('[data-testid="boot-screen"]');
  await boot.waitFor();
  await expect(page.getByText('SELFTEST OK')).toBeVisible();
  await expect(page.getByText('This unit detects nothing.')).toBeVisible();
  // Static shows the finished state: the priming transient is already logged under SELFTEST OK.
  await expect(page.getByTestId('transient')).toHaveText('TRANSIENT 1 · LOGGED');
  await expect(page.getByTestId('transient')).toHaveCSS('opacity', '1');
  // No dead band: the sticker sits under the last readout line with less than a division between them.
  const peak = (await page.getByText(/^NEXT PEAK/).boundingBox())!;
  const sticker = (await page.getByTestId('sticker').boundingBox())!;
  expect(sticker.y - (peak.y + peak.height)).toBeLessThan(40);
  expect(sticker.y).toBeGreaterThan(peak.y + peak.height - 4);
  await page.evaluate(() => document.fonts.ready);
  await waitWarped(page); // the warped snapshot is retaken after the last state change
  await page.screenshot({
    path: `e2e/screenshots/current/${testInfo.project.name}/boot.png`,
    fullPage: false,
  });
  await expect(page).toHaveScreenshot('boot.png', { maxDiffPixels: 150 });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

// ?calib=1 opens on the belief-calibration card. Keys are YES / NOT SURE / NO / SKIP.
test('boot calibration card renders', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/?static=1&date=2026-10-13&time=22:48&calib=1');
  await page.locator('[data-testid="boot-screen"]').waitFor();
  await expect(page.getByTestId('calibration')).toBeVisible();
  await expect(page.getByTestId('calibration-question')).toHaveText(/Have you ever experienced\s*something you couldn't\s*explain\?/);
  await expect(page.getByTestId('calibration-cursor')).toBeVisible();
  for (const id of ['key-calib-yes', 'key-calib-unsure', 'key-calib-no', 'key-calib-skip']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  // No boxed card: the block has no border. SKIP is a small glass target, slot 4 a dummy cap.
  const border = await page.getByTestId('calibration').evaluate((e) => getComputedStyle(e).borderTopWidth);
  expect(border).toBe('0px');
  await expect(page.getByTestId('key-calib-skip')).toHaveText('SKIP');
  const skip = (await page.getByTestId('key-calib-skip').boundingBox())!;
  expect(skip.width).toBeLessThan(72);
  const keyCount = await page.locator('[data-testid^="key-calib-"]').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width >= 72).length);
  expect(keyCount).toBe(3);
  // After ACK the paper label is stuck on the housing, bottom-left under the window, and is gone from the
  // glass. Every printed line sits whole on the paper, and the paper clears the window and the key plate.
  await expect(page.getByTestId('sticker')).toHaveCount(0);
  const mini = page.getByTestId('sticker-mini');
  await expect(mini).toBeVisible();
  const glassBox = (await page.getByTestId('boot-screen-glass').boundingBox())!;
  const miniBox = (await mini.boundingBox())!;
  const yes = (await page.getByTestId('key-calib-yes').boundingBox())!;
  expect(miniBox.x).toBeLessThan(glassBox.x + glassBox.width / 2);
  expect(miniBox.y).toBeGreaterThanOrEqual(glassBox.y + glassBox.height - 1);
  expect(miniBox.y + miniBox.height).toBeLessThanOrEqual(yes.y - 2);
  const transform = await mini.evaluate((e) => getComputedStyle(e).transform);
  const [a, b] = /matrix\(([^)]+)\)/.exec(transform)![1]!.split(',').map(Number);
  expect(Math.round((Math.atan2(b!, a!) * 180) / Math.PI * 10) / 10).toBe(-1.5);
  const cut = await mini.locator('div[dir="auto"]').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
  expect(cut).toBe(0);
  for (const line of ['SIMULATION UNIT ·', 'ENTERTAINMENT USE ONLY.']) {
    const head = (await mini.getByText(line).boundingBox())!;
    expect(head.x).toBeGreaterThanOrEqual(miniBox.x - 3);
    expect(head.x + head.width).toBeLessThanOrEqual(miniBox.x + miniBox.width + 3);
  }
  // No dead band: the calibration card sits under the countdown with less than 60 px between them.
  const countdown = (await page.getByTestId('countdown').boundingBox())!;
  const card = (await page.getByTestId('calibration').boundingBox())!;
  expect(card.y - (countdown.y + countdown.height)).toBeLessThan(60);
  await expect(page.getByTestId('countdown')).toHaveText('03:00 WINDOW IN 4 H 12 MIN');
  await page.evaluate(() => document.fonts.ready);
  await waitWarped(page);
  await page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/boot-calib.png` });
  await expect(page).toHaveScreenshot('boot-calib.png', { maxDiffPixels: 150 });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('the nameplate prints the full serial at every width and the activity digit lights at 3', async ({ page }) => {
  await page.goto('/?static=1&date=2026-10-13&time=22:48');
  await page.locator('[data-testid="boot-screen"]').waitFor();
  // A-07: the full serial fits the plate at 360 too (11 px, 0.4 tracking), and is printed once, on the plate.
  const serial = page.getByText(/^FS4-8711-00417-9$/);
  await expect(serial).toBeVisible();
  await expect(page.getByText(/FS4-8711-00417-9/)).toHaveCount(1);
  expect(await serial.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  await expect(page.getByTestId('activity')).toContainText('ACT IDX 3/5');
  expect((await page.getByTestId('activity').innerText()).includes('·')).toBe(false);
  // The ACT IDX glyphs are drawn on the glass canvas (p5 with bloom); the node beside it keeps the reading.
  await expect(page.getByTestId('activity').locator('xpath=..').locator('canvas')).toHaveCount(1);
  await expect(page.getByTestId('countdown')).toHaveText('03:00 WINDOW IN 4 H 12 MIN');
});

test('calibration answer sets the intensity, confirms, then opens the viewfinder once', async ({ page }) => {
  await page.goto('/?static=1&date=2026-10-13');
  await page.getByTestId('key-acknowledge').click();
  await page.getByTestId('key-calib-no').click();
  await expect(page.getByTestId('calibration-note')).toHaveText('Intensity set to BRAVE. Change any time in Settings.');
  await expect(page.getByTestId('screen-viewfinder')).toBeVisible();
  const stored = await page.evaluate(() => [localStorage.getItem('fs4.belief.v1'), localStorage.getItem('fs4.intensity.v1')]);
  expect(stored).toEqual(['no', 'brave']);
  // Asked once: the next ACKNOWLEDGE goes straight on.
  await page.goto('/?static=1&date=2026-10-13');
  await page.getByTestId('key-acknowledge').click();
  await expect(page.getByTestId('screen-viewfinder')).toBeVisible();
});

// The 03:00 window countdown follows the wall clock: it moves on the minute, not before and not
// on every render (the minute rule itself is covered in src/ui/boot/__tests__/activity.test.ts).
// The page's clock starts at 22:48:57 and runs in real time (Playwright's fake timers do not mix
// with the animation frame loop), so the minute turns 3 s in.
const startAt2248 = (page: import('@playwright/test').Page) =>
  page.addInitScript(() => {
    const Real = Date;
    const base = new Real(2026, 9, 13, 22, 48, 57).getTime();
    const t0 = Real.now();
    const now = () => base + (Real.now() - t0);
    class Shifted extends Real {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(now());
        else super(...(args as [number]));
      }
      static override now() {
        return now();
      }
    }
    (window as unknown as { Date: unknown }).Date = Shifted;
  });

test('the window countdown ticks on the minute on a live boot', async ({ page }) => {
  await startAt2248(page);
  await page.goto('/');
  await page.locator('[data-testid="boot-screen"]').waitFor();
  const countdown = page.getByTestId('countdown');
  await expect(countdown).toHaveText('03:00 WINDOW IN 4 H 12 MIN');
  await expect(countdown).toHaveText('03:00 WINDOW IN 4 H 11 MIN', { timeout: 8000 });
  // Once a minute: it holds for the rest of the minute.
  await page.waitForTimeout(3000);
  await expect(countdown).toHaveText('03:00 WINDOW IN 4 H 11 MIN');
});

// A fixed (dated or static) boot holds still.
test('a dated boot does not tick', async ({ page }) => {
  await startAt2248(page);
  await page.goto('/?date=2026-10-13&time=22:48');
  await page.locator('[data-testid="boot-screen"]').waitFor();
  await page.waitForTimeout(5000);
  await expect(page.getByTestId('countdown')).toHaveText('03:00 WINDOW IN 4 H 12 MIN');
});

// One priming transient, 1.5 s after the warm-up has settled; the log line is the record of it.
test('one priming transient lands on the trace after the warm-up and is logged', async ({ page }) => {
  await page.goto('/?date=2026-10-13&time=22:48');
  const t0 = Date.now();
  await page.locator('[data-testid="boot-screen"]').waitFor();
  const line = page.getByTestId('transient');
  await expect(line).toHaveCSS('opacity', '0');
  await expect(page.getByTestId('boot-transient')).toHaveCount(1);
  await expect(line).toHaveCSS('opacity', '1', { timeout: 8000 });
  // 900 ms warm-up plus 1.5 s: never sooner than 1.5 s after the page is up.
  expect(Date.now() - t0).toBeGreaterThanOrEqual(1500);
  // Logged once: it stays at 1 and nothing else repeats it.
  await page.waitForTimeout(1500);
  await expect(line).toHaveCSS('opacity', '1');
  // A live boot varies per launch (A-11): the record says 1 or 0 events, and a harness boot (static) always 1.
  await expect(line).toHaveText(/^TRANSIENT [01] · LOGGED$/);
  await expect(page.getByText(/^TRANSIENT [01] · LOGGED$/)).toHaveCount(1);
});
