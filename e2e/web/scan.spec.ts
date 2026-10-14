import { expect, test } from '@playwright/test';

// ?static=1&phase=<n|hold> freezes the theatre inside phase n (0 to 4) or the
// hold or the E-07 fault beat (forced on); ?seed fixes the outcome. ?speed=<n> runs the real timeline faster.
const SEED = 20261013;
// Seed 41 draws STRONG, so the hold shows LED 4 dark (D-009).
const STRONG_SEED = 41;

function watch(page: import('@playwright/test').Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  return () => {
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  };
}

for (const [name, phase] of [
  ['scan-phase2', '2'],
  ['scan-hold', 'hold'],
  ['scan-fault', 'fault'],
] as const) {
  test(`scan theatre ${name}`, async ({ page }, testInfo) => {
    const check = watch(page);
    await page.goto(`/scan?static=1&phase=${phase}&seed=${phase === 'hold' ? STRONG_SEED : SEED}`);
    await expect(page.getByTestId('screen-scan')).toBeVisible();
    await expect(page.getByTestId('scan-bar')).toBeVisible();
    await expect(page.getByTestId('key-cancel')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    if (phase === 'hold') {
      // The hold blanks only the live row; the percentage stays at 100%, the last telemetry stays.
      await expect(page.getByTestId('scan-percent')).toHaveText(/^\s*100%$/);
      // The live row keeps the last ΔT of the thermal phase, dimmed to p3 (never p2), with a HOLD tag after it.
      await expect(page.getByTestId('scan-live')).toContainText(/^ΔT\s*-\d\.\d\s*°C\s*HOLD$/);
      await expect(page.getByTestId('scan-held-tag')).toHaveText('HOLD');
      for (const part of await page.getByTestId('scan-held').locator('div[dir="auto"]').all()) {
        expect(await part.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(79, 180, 106)');
      }
      // The rate label stays through the hold; the value is a dash pair.
      await expect(page.getByTestId('scan-rate')).toHaveText(/^RATE\s+--\s+c\/s$/);
      await expect(page.getByTestId('scan-status')).toHaveText('DECODE 2048 BLOCKS');
      await expect(page.getByTestId('scan-readout')).toContainText('ACOUSTIC');
    } else if (phase === 'fault') {
      await expect(page.getByTestId('scan-status')).toHaveText(/^E-07 SENSOR DRIFT\.\s*RECALIBRATING\.$/);
      // The fault beat keeps the last ΔT with a HOLD tag, held lines at p3 (A-30): no hole where the block was.
      await expect(page.getByTestId('scan-live')).toContainText(/^ΔT\s*-\d\.\d\s*°C\s*HOLD$/);
      for (const part of await page.getByTestId('scan-held').locator('div[dir="auto"]').all()) {
        expect(await part.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(79, 180, 106)');
      }
      await expect(page.getByTestId('scan-rate')).toHaveText(/^RATE\s+--\s+c\/s$/);
    } else {
      // The pinned live row is the only thermal value; the log line carries none.
      await expect(page.getByTestId('scan-readout')).toContainText('THERMAL PROBE ZEROED');
      await expect(page.getByTestId('scan-live')).toContainText('ΔT');
      await expect(page.getByTestId('scan-readout')).not.toContainText(/THERMAL.*\d/);
      await expect(page.getByTestId('scan-rate')).toContainText('RATE');
    }
    await page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/${name}.png` });
    await expect(page).toHaveScreenshot(`${name}.png`, { maxDiffPixels: 150 });
    // Frozen means frozen: a second look 400 ms later is the same picture.
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot(`${name}.png`, { maxDiffPixels: 150 });
    check();
  });
}

test('scan runs to the end, saves one record and opens the result', async ({ page }) => {
  const check = watch(page);
  await page.goto(`/scan?static=1&speed=40&seed=${SEED}`);
  await expect(page.getByTestId('screen-result')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('CASE 0001')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fs4.scans.v1') ?? '[]'));
  expect(saved).toHaveLength(1);
  expect(saved[0].id).toBe('0001');
  expect(saved[0].seed).toBe(SEED);
  check();
});

test('cancel returns to the viewfinder and saves nothing', async ({ page }) => {
  const check = watch(page);
  await page.goto('/viewfinder?static=1');
  await page.getByTestId('key-capture').click();
  await expect(page.getByTestId('screen-scan')).toBeVisible();
  await page.getByTestId('key-cancel').click();
  await expect(page.getByTestId('screen-viewfinder')).toBeVisible();
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => localStorage.getItem('fs4.scans.v1'));
  expect(saved).toBeNull();
  check();
});

// A live run (nothing frozen): in the 1.2 s hold the HOLD tag after the held ΔT blinks at 1 Hz. The page
// records the tag's opacity itself every 25 ms (a test round trip is too slow under load).
test('the HOLD tag after the held ΔT blinks', async ({ page }) => {
  test.setTimeout(45_000);
  await page.addInitScript(() => {
    const w = window as unknown as { __blink: string[] };
    w.__blink = [];
    setInterval(() => {
      const e = document.querySelector('[data-testid="scan-held-tag"]');
      if (e) w.__blink.push(getComputedStyle(e).opacity);
    }, 25);
  });
  await page.goto(`/scan?seed=${STRONG_SEED}`);
  await expect(page.getByTestId('screen-result')).toBeVisible({ timeout: 30_000 });
  const seen = await page.evaluate(() => [...new Set((window as unknown as { __blink: string[] }).__blink)].sort());
  expect(seen).toEqual(['0', '1']);
});
