import { expect, test } from '@playwright/test';

// ?static=1&demo=quiet|active|critical builds the record from a fixed seed
// (src/ui/result/demo.ts) over the cellar fixture, so the picture is the same
// on every run. Reveal, jitter and the not-fitted timer are frozen under static.
const DEMOS = [
  { demo: 'quiet', tier: 'QUIET' },
  { demo: 'active', tier: 'ACTIVE' },
  { demo: 'strong', tier: 'STRONG' },
  { demo: 'critical', tier: 'CRITICAL' },
] as const;

// The same active demo over the other photos, with a second case number.
const FIXTURES = ['bright', 'outdoors'] as const;

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

async function settle(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('result-photo')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
}

for (const { demo, tier } of DEMOS) {
  test(`result ${demo}`, async ({ page }, testInfo) => {
    const check = watch(page);
    await page.goto(`/result/demo?static=1&fixture=cellar&demo=${demo}`);
    await expect(page.getByTestId('screen-result')).toBeVisible();
    await settle(page);
    await expect(page.getByTestId('result-tier')).toHaveText(tier);
    await expect(page.getByTestId('key-share')).toBeVisible();
    if (demo === 'quiet') {
      // DEEP SCAN is a dummy cap on QUIET and TRACE: nothing to decode, no offer.
      await expect(page.getByTestId('key-deepscan')).toHaveCount(0);
      await expect(page.getByTestId('result-offer')).toHaveCount(0);
      await expect(page.getByTestId('result-profile').getByText('NO SIGNATURE')).toBeVisible();
      await expect(page.getByTestId('ghost-v0')).toHaveCount(0);
    } else {
      await expect(page.getByTestId('key-deepscan')).toBeVisible();
      await expect(page.getByTestId('result-offer')).toHaveText('Run DEEP SCAN to resolve designation, behaviour and EVP. Short video plays.');
      await expect(page.getByTestId('result-decoded')).toContainText('SIGNATURE PARTIALLY DECODED:');
      await expect(page.getByTestId('profile-mask')).toHaveCount(3);
      await expect(page.getByTestId('ghost-v0')).toHaveCount(1);
    }
    await expect(page.getByTestId('key-back')).toHaveText('NEW SCAN');
    const line = page.getByTestId('result-line');
    if (demo === 'strong') {
      await expect(line).toHaveText('Strong. Signature resolving.');
      await expect(page.getByTestId('result-coldspot')).toHaveText(/^COLD SPOT ΔT -\d+\.\d °C$/);
      const cold = await page.getByTestId('result-coldspot').innerText();
      const therm = await page.getByText(/^THERM/).first().innerText();
      expect(therm.replace(/\s+/g, ' ')).not.toContain(cold.replace('COLD SPOT ΔT ', ''));
    } else {
      await expect(page.getByTestId('result-coldspot')).toHaveCount(0);
    }
    if (demo === 'critical') {
      const text = await line.innerText();
      const hz = Number(/^EVP fragment logged\. CH2 (\d+) Hz\.$/.exec(text)?.[1]);
      expect(hz).toBeGreaterThanOrEqual(180);
      expect(hz).toBeLessThanOrEqual(420);
    }
    // The line spans the glass under the tier row, the decoded line sits under the profile.
    const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
    const lineBox = await box('result-line');
    const glassBox = await box('result-spi');
    expect(lineBox.y).toBeGreaterThan(glassBox.y + glassBox.height - 1);
    if (demo !== 'quiet') {
      const prof = await box('result-profile');
      const dec = await box('result-decoded');
      expect(dec.y - (prof.y + prof.height)).toBeLessThanOrEqual(8);
      expect(dec.y).toBeGreaterThanOrEqual(prof.y + prof.height);
      const off = await box('result-offer');
      const deep = await box('key-deepscan');
      expect(deep.y - (off.y + off.height)).toBeLessThanOrEqual(80);
    }
    // The key row is one fixed grid: four 72 px slots at the same x on every screen.
    const xs = await page.locator('[data-testid^="key-"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)));
    expect(new Set(xs).size).toBe(xs.length);
    await page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/result-${demo}.png` });
    await expect(page).toHaveScreenshot(`result-${demo}.png`, { maxDiffPixels: 150 });
    check();
  });
}

for (const fixture of FIXTURES) {
  test(`result active over ${fixture}`, async ({ page }, testInfo) => {
    const check = watch(page);
    await page.goto(`/result/demo?static=1&fixture=${fixture}&demo=active&case=0002`);
    await expect(page.getByTestId('screen-result')).toBeVisible();
    await settle(page);
    await expect(page.getByText('CASE 0002')).toBeVisible();
    await expect(page.getByTestId('result-tier')).toHaveText('ACTIVE');
    await expect(page.getByTestId('ghost-v0')).toHaveCount(1);
    await page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/result-active-${fixture}.png` });
    await expect(page).toHaveScreenshot(`result-active-${fixture}.png`, { maxDiffPixels: 150 });
    check();
  });
}

test('inert keys show one line and no ad surface exists', async ({ page }) => {
  const check = watch(page);
  await page.goto('/result/demo?static=1&fixture=cellar&demo=active');
  await settle(page);
  await expect(page.getByTestId('result-line')).toHaveText('Activity logged.');
  await page.getByTestId('key-deepscan').click();
  await expect(page.getByTestId('result-line')).toHaveText('NOT FITTED IN THIS UNIT');
  // No ad, banner or interstitial surface and no sponsor copy anywhere on the screen.
  const ids = await page.locator('[data-testid]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid') ?? ''));
  expect(ids.length).toBeGreaterThan(10);
  expect(ids.filter((id) => /ad|banner|interstitial/i.test(id))).toEqual([]);
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/sponsored|advertisement/i);
  check();
});

test('QUIET fills the lower glass with the best earlier case', async ({ page }) => {
  const check = watch(page);
  await page.goto('/result/demo?static=1&fixture=cellar&demo=quiet&case=0002');
  await settle(page);
  await expect(page.getByTestId('result-best')).toHaveText('NO PRIOR CASES');
  const at = new Date(2026, 9, 12, 23, 41).getTime();
  const prior = {
    id: '0001', createdAt: at, photoUri: 'x', tag: 'cellar', seed: 5,
    outcome: { tier: 'strong', spi: 84, figureShown: true, smudge: false, jumpScare: false, scanDurationMs: 7000 },
    profile: { class: 'RESIDUAL', era: 'e', name: 'RSD-1', traits: [], signatureDecodedPct: 50 },
  };
  await page.evaluate((r) => localStorage.setItem('fs4.scans.v1', JSON.stringify([r])), prior);
  await page.goto('/result/demo?static=1&fixture=cellar&demo=quiet&case=0002');
  await settle(page);
  await expect(page.getByTestId('result-best')).toHaveText('BEST SO FAR: 84 STRONG · CELLAR · 23:41');
  check();
});

test('the reveal holds silent for 1.2 s, then lands the number', async ({ page }) => {
  const check = watch(page);
  const rec = {
    id: '0001', createdAt: Date.now(), tag: 'hall', seed: 95,
    photoUri: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    outcome: { tier: 'active', spi: 62, figureShown: false, smudge: false, jumpScare: false, scanDurationMs: 7000 },
    profile: { class: 'KEEPER', era: 'Era est. 1905 to 1973', name: 'RSD-9', traits: [], signatureDecodedPct: 61 },
  };
  await page.addInitScript((r) => localStorage.setItem('fs4.scans.v1', JSON.stringify([r])), rec);
  await page.goto('/result/0001');
  await expect(page.getByTestId('result-photo')).toBeVisible();
  const spi = page.getByTestId('result-spi');
  await expect(spi).toHaveText('--');
  await page.waitForTimeout(800);
  await expect(spi).toHaveText('--');
  await expect(spi).toHaveText('62', { timeout: 5000 });
  check();
});

test('a missing case shows NO RECORD and a way back', async ({ page }) => {
  const check = watch(page);
  await page.goto('/result/9999?static=1');
  await expect(page.getByTestId('result-missing')).toBeVisible();
  await expect(page.getByText('NO RECORD')).toBeVisible();
  await page.getByTestId('key-back').click();
  await expect(page.getByTestId('screen-viewfinder')).toBeVisible();
  check();
});
