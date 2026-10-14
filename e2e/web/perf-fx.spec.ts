import { expect, test, type Page } from '@playwright/test';

// P8-03, the FX half of the performance budget, measured at CPU throttle x4 (CDP
// Emulation.setCPUThrottlingRate; FX_CPU_RATE overrides it for an x1 reference run).
// - Scan theatre: the FX frame counter (src/fx/perf, window.__fxFrames) records every rAF interval
//   from the moment the theatre is on the glass until the result screen is attached (the route change
//   itself is excluded). Budget: p50 at or above 55 fps; p95 is recorded.
// - Result print: the story card through the public renderShareCard on /share-probe; the probe
//   carries the step timings as data-ms-* attributes. Budget: draw plus PNG encode under 1500 ms.
// Numbers go to stdout as `[perf-fx] {...}` lines so the CI log carries them. 390 only.
const RATE = Number(process.env.FX_CPU_RATE ?? 4);
const SCAN_FPS_MIN = 55;
const PRINT_MS_MAX = 1500;

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
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

test(`scan theatre holds ${SCAN_FPS_MIN} fps at p50 under CPU x${RATE}`, async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watch(page);
  await throttle(page);
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
  console.log(`[perf-fx] scan ${JSON.stringify({ cpu: RATE, frames, spanMs, p50Ms, p95Ms, maxMs, meanMs, fpsP50, fpsMean, over33 })}`);
  expect(frames).toBeGreaterThan(100); // a full theatre: 6 to 10 s
  expect(fpsP50).toBeGreaterThanOrEqual(SCAN_FPS_MIN);
  expect(errors).toEqual([]);
});

test(`story card draw plus encode under ${PRINT_MS_MAX} ms under CPU x${RATE}`, async ({ page }) => {
  test.setTimeout(120_000);
  // Over budget today (docs/perf-fx.md: about 29 s at x4 before P8-03, CanvasKit CPU raster in wasm).
  // Expected to fail until fixed; the threshold is not loosened, and a pass turns this red so the marker comes off.
  test.fail(true, 'print over the 1500 ms budget, see docs/perf-fx.md');
  const errors = watch(page);
  await throttle(page);
  await page.goto('/share-probe?static=1&format=story&case=critical-deep&fixture=cellar');
  const card = page.getByTestId('share-card');
  await card.waitFor({ timeout: 90_000 });
  const ms = await card.evaluate((e) => {
    const d = (e as HTMLElement).dataset;
    return { load: Number(d.msLoad), draw: Number(d.msDraw), encode: Number(d.msEncode), save: Number(d.msSave), total: Number(d.msTotal) };
  });
  const print = Math.round((ms.draw + ms.encode) * 10) / 10;
  console.log(`[perf-fx] print ${JSON.stringify({ cpu: RATE, format: 'story', ...ms, print })}`);
  expect(Number.isFinite(print)).toBe(true);
  expect(print).toBeLessThan(PRINT_MS_MAX);
  expect(errors).toEqual([]);
});

