import { expect, test, type Page } from '@playwright/test';

// P8-03, the FX half of the performance budget (D-046).
// - Scan theatre: the FX frame counter (src/fx/perf, window.__fxFrames) records every rAF interval
//   from the moment the theatre is on the glass until the result screen is attached (the route change
//   itself is excluded). Guard: p50 at or above 55 fps under CPU throttle x2 (D-046 ruling 3). A
//   second run at x4 prints p50, p95 and mean and asserts nothing (no phone behind that number).
// - Result print: the story card through the public renderShareCard on /share-probe; the probe
//   carries the step timings as data-ms-* attributes. Regression guard (D-046 rulings 1, 2): draw
//   plus encode at x1 no more than 1.5x the x1 baseline recorded in docs/perf-fx.md. The 1.5 s
//   phone budget is measured at phone check 3, not here.
// Numbers go to stdout as `[perf-fx] {...}` lines so the CI log carries them. 390 only.
// FX_CPU_RATE overrides the scan guard's rate (default 2).
const SCAN_RATE = Number(process.env.FX_CPU_RATE ?? 2);
const SCAN_FPS_MIN = 55;
/** Story card draw + encode at x1 on the committed head 167b731 (two runs: 4618.5, 4290.8 ms; docs/perf-fx.md). */
const PRINT_BASELINE_MS = 4620;
const PRINT_MS_MAX = Math.round(1.5 * PRINT_BASELINE_MS);

async function throttle(page: Page, rate: number) {
  if (rate <= 1) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
}

function watch(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test.beforeEach(({ page: _page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-390x844', 'budgets measured at 390 only');
});

async function scanRun(page: Page, rate: number): Promise<{ fpsP50: number; frames: number }> {
  test.setTimeout(120_000);
  const errors = watch(page);
  await throttle(page, rate);
  await page.goto('/viewfinder?fixture=cellar');
  await expect(page.getByTestId('screen-viewfinder')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
  await page.waitForTimeout(2500); // the viewfinder settles (warm-up, first snapshot)
  await page.getByTestId('key-capture').click();
  await expect(page.getByTestId('scan-bar')).toBeVisible();
  // Start on the theatre; stop inside the observer that sees the result attach, before its first frame.
  await page.evaluate(() => {
    const w = window as unknown as { __fxFrames: { start(): void; stop(): unknown }; __fxScan?: unknown };
    w.__fxFrames.start();
    const obs = new MutationObserver(() => {
      if (!document.querySelector('[data-testid="screen-result"]')) return;
      w.__fxScan = w.__fxFrames.stop();
      obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
  await expect(page.getByTestId('screen-result')).toBeVisible({ timeout: 60_000 });
  const st = await page.evaluate(() => (window as unknown as { __fxScan: { frames: number; spanMs: number; p50Ms: number; p95Ms: number; maxMs: number; meanMs: number; fpsP50: number; fpsMean: number; over33: number } }).__fxScan);
  const { frames, spanMs, p50Ms, p95Ms, maxMs, meanMs, fpsP50, fpsMean, over33 } = st;
  console.log(`[perf-fx] scan ${JSON.stringify({ cpu: rate, frames, spanMs, p50Ms, p95Ms, maxMs, meanMs, fpsP50, fpsMean, over33 })}`);
  expect(errors).toEqual([]);
  return { fpsP50, frames };
}

test(`scan theatre holds ${SCAN_FPS_MIN} fps at p50 under CPU x${SCAN_RATE}`, async ({ page }) => {
  const { fpsP50, frames } = await scanRun(page, SCAN_RATE);
  expect(frames).toBeGreaterThan(100); // a full theatre: 6 to 10 s
  expect(fpsP50).toBeGreaterThanOrEqual(SCAN_FPS_MIN);
});

test('scan theatre at CPU x4 (reported, not asserted)', async ({ page }) => {
  await scanRun(page, 4);
});

test(`story card draw plus encode at x1 within 1.5x the baseline (${PRINT_MS_MAX} ms)`, async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watch(page);
  await page.goto('/share-probe?static=1&format=story&case=critical-deep&fixture=cellar');
  const card = page.getByTestId('share-card');
  await card.waitFor({ timeout: 90_000 });
  const ms = await card.evaluate((e) => {
    const d = (e as HTMLElement).dataset;
    return { load: Number(d.msLoad), draw: Number(d.msDraw), encode: Number(d.msEncode), save: Number(d.msSave), total: Number(d.msTotal) };
  });
  const print = Math.round((ms.draw + ms.encode) * 10) / 10;
  console.log(`[perf-fx] print ${JSON.stringify({ cpu: 1, format: 'story', ...ms, print })}`);
  expect(Number.isFinite(print)).toBe(true);
  expect(print).toBeLessThanOrEqual(PRINT_MS_MAX);
  expect(errors).toEqual([]);
});

