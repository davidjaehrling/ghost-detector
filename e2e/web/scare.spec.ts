import { expect, test, type Page } from '@playwright/test';

// P3-06: the jump-scare is a 500 ms visual at the reveal of a CRITICAL result that the engine has
// flagged. Seed 43 draws CRITICAL with the scare roll passing for Standard once three scans are on
// file (the first-3-scans rule is the engine's, tested there).
const SCARE_SEED = 43;

const priorScans = JSON.stringify(
  [1, 2, 3].map((n) => ({
    id: String(n).padStart(4, '0'),
    createdAt: 1_700_000_000_000 + n,
    photoUri: '/fixtures/cellar.jpg',
    seed: 1000 + n,
    outcome: { tier: 'quiet', spi: 10, figureShown: false, smudge: false, jumpScare: false, scanDurationMs: 6000 },
    profile: { name: `Prior ${n}`, traits: [] },
  })),
);

async function withHistory(page: Page) {
  await page.addInitScript((scans) => {
    if (!localStorage.getItem('fs4.scans.v1')) localStorage.setItem('fs4.scans.v1', scans);
  }, priorScans);
}

// Records every flash layer that mounts and when, from before the page loads.
async function watchFlashes(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __flashes: number[] };
    w.__flashes = [];
    const seen = (n: Node) => {
      if (!(n instanceof HTMLElement)) return;
      if (n.dataset?.testid === 'scare-flash' || n.querySelector?.('[data-testid="scare-flash"]')) w.__flashes.push(performance.now());
    };
    new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach(seen))).observe(document, { childList: true, subtree: true });
  });
}

const flashes = (page: Page) => page.evaluate(() => (window as unknown as { __flashes: number[] }).__flashes);
const cues = (page: Page) => page.evaluate(() => (window as unknown as { __cueLog?: string[] }).__cueLog ?? []);

test('a flagged CRITICAL reveal flashes twice and calls the engine and the haptics once', async ({ page }) => {
  await withHistory(page);
  await watchFlashes(page);
  await page.goto(`/scan?static=1&speed=8&seed=${SCARE_SEED}`);
  await expect(page.getByTestId('screen-result')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('result-tier')).toHaveText('CRITICAL');
  await expect.poll(async () => (await flashes(page)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(800);
  const at = await flashes(page);
  expect(at).toHaveLength(2);
  // The 260 ms cadence is unit-tested (scare.test.ts). Headless frames are slow and a flash is only
  // seen once committed, so here the two flashes just have to be distinct and close together. A late
  // frame stretches the sequence (nextSegment holds each picture for a painted frame), and three
  // browsers share the CPU in a full run, so the ceiling is 2 s, not the 1 s of the real cadence.
  expect(at[1]! - at[0]!).toBeGreaterThan(80);
  expect(at[1]! - at[0]!).toBeLessThan(2000);
  expect((await cues(page)).filter((c) => c === 'scare')).toHaveLength(1);
  const haptic = await page.evaluate(() => (window as unknown as { __hapticLog: () => { event: string; args: unknown[] }[] }).__hapticLog().filter((e) => e.event === 'fire').map((e) => e.args[0]));
  expect(haptic.filter((h) => h === 'scare')).toHaveLength(1);
  await expect(page.getByTestId('scare-flash')).toHaveCount(0);

  // Opening the same case again from its address is not a reveal: no second scare.
  const id = (await page.url()).split('/').pop()!.split('?')[0]!;
  await page.goto(`/result/${id}?static=1`);
  await expect(page.getByTestId('screen-result')).toBeVisible();
  await page.waitForTimeout(800);
  expect(await flashes(page)).toHaveLength(0);
});

test('the Settings switch off: no flash, no engine scare', async ({ page }) => {
  await withHistory(page);
  await page.addInitScript(() => localStorage.setItem('fs4.settings.v1', JSON.stringify({ jumpScares: false })));
  await watchFlashes(page);
  await page.goto(`/scan?static=1&speed=8&seed=${SCARE_SEED}`);
  await expect(page.getByTestId('result-tier')).toHaveText('CRITICAL', { timeout: 15_000 });
  await page.waitForTimeout(1500);
  expect(await flashes(page)).toHaveLength(0);
  expect(await cues(page)).not.toContain('scare');
});

test('reduced motion removes the flash', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await withHistory(page);
  await watchFlashes(page);
  await page.goto(`/scan?static=1&speed=8&seed=${SCARE_SEED}`);
  await expect(page.getByTestId('result-tier')).toHaveText('CRITICAL', { timeout: 15_000 });
  await page.waitForTimeout(1500);
  expect(await flashes(page)).toHaveLength(0);
  expect(await cues(page)).not.toContain('scare');
});

test('Calm never scares, whatever the switch says', async ({ page }) => {
  await withHistory(page);
  await page.addInitScript(() => {
    localStorage.setItem('fs4.intensity.v1', 'calm');
    localStorage.setItem('fs4.settings.v1', JSON.stringify({ jumpScares: true }));
  });
  await watchFlashes(page);
  await page.goto(`/scan?static=1&speed=8&seed=${SCARE_SEED}`);
  await expect(page.getByTestId('screen-result')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  expect(await flashes(page)).toHaveLength(0);
  expect(await cues(page)).not.toContain('scare');
});

test('result-scare: the peak frame', async ({ page }, testInfo) => {
  test.skip(page.viewportSize()?.width !== 390, 'one golden, at 390');
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/result/demo?static=1&fixture=cellar&demo=critical&scare=1');
  await expect(page.getByTestId('screen-result')).toBeVisible();
  await expect(page.getByTestId('scare-flash')).toBeVisible();
  await expect(page.getByTestId('result-photo')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
  await page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/result-scare.png` });
  await expect(page).toHaveScreenshot('result-scare.png', { maxDiffPixels: 150 });
  expect(errors).toEqual([]);
});
