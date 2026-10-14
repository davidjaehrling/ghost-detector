import { expect, test, type Page } from '@playwright/test';
import { waitWarped } from './warped';

// ?static=1&demo=quiet|active|critical builds the record from a fixed seed
// (src/ui/result/demo.ts) over the cellar fixture, so the picture is the same
// on every run. Reveal, jitter and the not-fitted timer are frozen under static.
const DEMOS = [
  { demo: 'quiet', tier: 'QUIET' },
  { demo: 'active', tier: 'ACTIVE' },
  { demo: 'strong', tier: 'STRONG' },
  { demo: 'critical', tier: 'CRITICAL' },
] as const;

// The active demo over the other photos: each has its own seed (so its own profile) and case number.
const FIXTURES = [
  { fixture: 'bright', caseNo: '0003' },
  { fixture: 'outdoors', caseNo: '0007' },
] as const;

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

const frames = (page: import('@playwright/test').Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function settle(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('result-photo')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
  // The data strip's font has loaded (its canvas is drawn once aria-busy clears).
  await expect(page.getByTestId('result-stamp')).toHaveAttribute('aria-busy', 'false');
  // The photo and digit canvases have drawn and the warped snapshot has been retaken.
  await frames(page);
  await waitWarped(page);
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
      // DEEP SCAN is absent on QUIET and TRACE: nothing to decode, no offer. Key 4 is LOG.
      await expect(page.getByTestId('deepscan-key')).toHaveCount(0);
      await expect(page.getByTestId('key-log')).toHaveText('LOG');
      await expect(page.getByTestId('result-profile').getByText('NO SIGNATURE')).toBeVisible();
      // The composite runs disabled on QUIET (no figure) so the auto-gain and tint still show (A-45).
      await expect(page.getByTestId('composite')).toHaveCount(1);
      await expect(page.getByTestId('ghost-v0')).toHaveCount(0);
    } else {
      await expect(page.getByTestId('deepscan-key')).toBeVisible();
      // Nothing prints above key 4 until the first press arms it (D-045 1).
      await expect(page.getByTestId('deepscan-line')).toHaveCount(0);
      await expect(page.getByTestId('result-decoded')).toContainText('SIGNATURE PARTIALLY DECODED:');
      await expect(page.getByTestId('profile-mask')).toHaveCount(3);
      await expect(page.getByTestId('composite')).toHaveCount(1);
      await expect(page.getByTestId('ghost-v0')).toHaveCount(0);
      await expect(page.getByTestId('profile-era')).toHaveText(/^[^a-z]+$/);
    }
    await expect(page.getByTestId('key-back')).toHaveText('NEW SCAN');
    const line = page.getByTestId('result-line');
    if (demo === 'strong' || demo === 'critical') {
      if (demo === 'strong') await expect(line).toHaveText('Strong. Signature resolving.');
      await expect(page.getByTestId('result-coldspot')).toHaveText(/^COLD ΔT MIN -\d+\.\d °C {2}DRIFT \d\.\d kHz$/);
      const cold = (await page.getByTestId('result-coldspot').innerText()).split('  ')[0]!;
      const therm = await page.getByText(/^ΔT\sAVG\s+-?\d/).first().innerText();
      expect(therm.replace(/\s+/g, ' ')).not.toContain(cold.replace('COLD ΔT MIN ', ''));
    } else {
      await expect(page.getByTestId('result-coldspot')).toHaveCount(0);
      if (demo === 'active') await expect(line).toHaveText('Activity logged.');
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
      // Key 4 is a hardware key under the glass; the decode bar closes the glass content above it.
      const deep = await box('deepscan-key');
      expect(deep.y).toBeGreaterThan((await box('decode-bar')).y);
    }
    // The key row is one fixed grid: four 72 px slots at the same x on every screen.
    const xs = await page.locator('[data-testid^="key-"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)));
    expect(new Set(xs).size).toBe(xs.length);
    await page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/result-${demo}.png` });
    await expect(page).toHaveScreenshot(`result-${demo}.png`, { maxDiffPixels: 150 });
    check();
  });
}

for (const { fixture, caseNo } of FIXTURES) {
  test(`result active over ${fixture}`, async ({ page }, testInfo) => {
    const check = watch(page);
    await page.goto(`/result/demo?static=1&fixture=${fixture}&demo=active&case=${caseNo}`);
    await expect(page.getByTestId('screen-result')).toBeVisible();
    await settle(page);
    await expect(page.getByTestId('result-stamp')).toHaveAttribute('aria-label', new RegExp(`^CASE ${caseNo} `));
    await expect(page.getByTestId('result-tier')).toHaveText('ACTIVE');
    await expect(page.getByTestId('composite')).toHaveCount(1);
    await page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/result-active-${fixture}.png` });
    await expect(page).toHaveScreenshot(`result-active-${fixture}.png`, { maxDiffPixels: 150 });
    check();
  });
}

test('THERM swaps the photo for the thermal view of the same frame and PHOTO swaps back', async ({ page }) => {
  const check = watch(page);
  await page.goto('/result/demo?static=1&fixture=cellar&demo=critical');
  await settle(page);
  const photo = (await page.getByTestId('result-photo').boundingBox())!;
  await expect(page.getByTestId('key-therm')).toHaveText('THERM');
  await expect(page.getByTestId('thermal-view')).toHaveCount(0);
  await page.getByTestId('key-therm').click();
  await expect(page.getByTestId('thermal-view')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('key-therm')).toHaveText('PHOTO');
  const view = (await page.getByTestId('thermal-view').boundingBox())!;
  expect(Math.abs(view.x - photo.x)).toBeLessThan(1.5);
  expect(Math.abs(view.width - photo.width)).toBeLessThan(1.5);
  expect(view.y).toBeGreaterThanOrEqual(photo.y - 1.5);
  expect(view.y + view.height).toBeLessThanOrEqual(photo.y + photo.height + 1.5);
  // One number on screen: on CRITICAL the view prints the COLD SPOT line's ΔT (not the THERM reading).
  const cold = (await page.getByTestId('result-coldspot').innerText()).replace(/\s+/g, ' ');
  const dt = /ΔT MIN (-\d+\.\d) °C/.exec(cold)?.[1];
  expect(dt).toBeDefined();
  await expect(page.getByTestId('thermal-view')).toHaveAttribute('aria-label', new RegExp(`ΔT ${dt!} `));
  await expectStripOnTherm(page);
  await page.getByTestId('key-therm').click();
  await expect(page.getByTestId('thermal-view')).toHaveCount(0);
  await expect(page.getByTestId('key-therm')).toHaveText('THERM');
  check();
});

// D-034, D-041: while the thermal view is shown the data strip is on screen, its text ends with the mark,
// and nothing on the thermal view covers it (the SP1 caption sits at the top, the strip at the bottom).
async function expectStripOnTherm(page: Page, mark = 'SIMULATED') {
  await expect(page.getByTestId('result-stamp')).toHaveAttribute('aria-busy', 'false');
  const strip = page.getByTestId('result-stamp');
  expect(((await strip.getAttribute('aria-label')) ?? '').trim().endsWith(mark)).toBe(true);
  const sb = (await strip.boundingBox())!;
  const vb = (await page.getByTestId('thermal-view').boundingBox())!;
  expect(sb.y).toBeGreaterThan(vb.y + vb.height / 2);
  expect(sb.y + sb.height).toBeLessThanOrEqual(vb.y + vb.height + 1);
  // The strip is the topmost element at its own centre (the thermal view is not drawn over it).
  const top = await strip.evaluate((e) => {
    const r = e.getBoundingClientRect();
    const hit = document.elementsFromPoint(r.left + 20, r.top + r.height / 2);
    return hit.findIndex((n) => n === e || e.contains(n)) <= hit.findIndex((n) => n.getAttribute('data-testid') === 'thermal-view');
  });
  expect(top).toBe(true);
  const w = Number(await strip.getAttribute('data-text-w'));
  expect(w + 8 + 4).toBeLessThanOrEqual(sb.width);
}

test('result-therm-critical: the thermal view', async ({ page }, testInfo) => {
  test.skip(page.viewportSize()?.width !== 390, 'one golden, at 390');
  const check = watch(page);
  await page.goto('/result/demo?static=1&fixture=cellar&demo=critical&therm=1');
  await expect(page.getByTestId('screen-result')).toBeVisible();
  await expect(page.getByTestId('thermal-view')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('key-therm')).toHaveText('PHOTO');
  await page.evaluate(() => document.fonts.ready);
  await frames(page);
  await page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/result-therm-critical.png` });
  // The thermal panel is a Skia shader; the runner's software renderer differs from the
  // container by about 2% of the panel, so this golden uses the Skia tolerance (400 px for
  // probes, more here because the whole 318x303 panel is shader output). The label above
  // guards the content.
  await expect(page.getByTestId('thermal-view')).toHaveAttribute('aria-label', /ΔT -\d+\.\d °C/);
  await expectStripOnTherm(page);
  await expect(page).toHaveScreenshot('result-therm-critical.png', { maxDiffPixels: 2500 });
  check();
});

test('SHARE opens the format choice, and the only ad surface on the result is the DEEP SCAN key', async ({ page }) => {
  const check = watch(page);
  await page.goto('/result/demo?static=1&fixture=cellar&demo=active');
  await settle(page);
  await expect(page.getByTestId('result-line')).toHaveText('Activity logged.');
  await page.getByTestId('key-share').click();
  await expect(page.getByTestId('share-line')).toHaveText('Print field card. Format?');
  // While the flow is open key 4 is a dark cap and the sponsored line is gone: no ad shares the glass.
  await expect(page.getByTestId('deepscan-key')).toHaveCount(0);
  await expect(page.getByTestId('deepscan-line')).toHaveCount(0);
  // No banner or interstitial surface and no sponsor line.
  const ids = await page.locator('[data-testid]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid') ?? ''));
  expect(ids.length).toBeGreaterThan(10);
  expect(ids.filter((id) => /banner|interstitial/i.test(id))).toEqual([]);
  const body = await page.locator('body').innerText();
  expect(body.match(/sponsored/gi)).toBeNull();
  expect(body).not.toMatch(/advertisement/i);
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
  const best = await page.getByTestId('result-best').boundingBox();
  const text = await page.getByTestId('result-best').locator('div,span').first().boundingBox();
  // Glass text under a rule, left aligned, not a boxed card.
  expect(await page.getByTestId('result-best').evaluate((el) => getComputedStyle(el).borderLeftWidth)).toBe('0px');
  expect(text!.x - best!.x).toBeLessThan(4);
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
  // Time the number from the page itself: a slow headless frame must not make the 1.2 s hold look short.
  await page.addInitScript(() => {
    const w = window as unknown as { __spi: { dash?: number; num?: number } };
    w.__spi = {};
    const look = () => {
      const el = document.querySelector('[data-testid="result-spi"]');
      const text = el?.textContent;
      if (text === '--' && w.__spi.dash === undefined) w.__spi.dash = performance.now();
      if (text === '62' && w.__spi.num === undefined) w.__spi.num = performance.now();
    };
    new MutationObserver(look).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await page.goto('/result/0001');
  await expect(page.getByTestId('result-photo')).toBeVisible();
  const spi = page.getByTestId('result-spi');
  await expect(spi).toHaveText('62', { timeout: 8000 });
  const { dash, num } = await page.evaluate(() => (window as unknown as { __spi: { dash?: number; num?: number } }).__spi);
  expect(dash).toBeDefined();
  expect(num! - dash!).toBeGreaterThanOrEqual(1100);
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

// The photo window is one height on every tier, and the demos of one photo differ tier to tier.
test('the photo window is the same height on every tier and each cellar case has its own number', async ({ page }) => {
  const heights: number[] = [];
  const stamps: string[] = [];
  for (const { demo } of DEMOS) {
    await page.goto(`/result/demo?static=1&fixture=cellar&demo=${demo}`);
    await settle(page);
    heights.push(Math.round((await page.getByTestId('result-photo').boundingBox())!.height));
    stamps.push((await page.getByTestId('result-stamp').getAttribute('aria-label'))!);
  }
  expect(new Set(heights).size).toBe(1);
  expect(new Set(stamps.map((t) => /^CASE (\d{4})/.exec(t)![1])).size).toBe(4);
  await page.goto('/result/demo?static=1&fixture=cellar&demo=critical&scare=1');
  await settle(page);
  expect(Math.round((await page.getByTestId('result-photo').boundingBox())!.height)).toBe(heights[0]);
  expect(stamps.map((t) => /^CASE (\d{4})/.exec(t)![1])).not.toContain(/^CASE (\d{4})/.exec((await page.getByTestId('result-stamp').getAttribute('aria-label'))!)![1]);
});

// The data strip burned into the photo's lower left: case, SPI, ΔT, time (share crop).
for (const { demo } of DEMOS) {
  test(`the data strip on ${demo} carries case, SPI, ΔT and the time, bottom-left on the photo`, async ({ page }) => {
    await page.goto(`/result/demo?static=1&fixture=cellar&demo=${demo}`);
    await settle(page);
    const strip = page.getByTestId('result-stamp');
    const label = (await strip.getAttribute('aria-label'))!;
    // Two lines (A-40): case, SPI and time, then the labelled ΔT and the mark, which is always last.
    const m = /^CASE (\d{4}) {2}SPI (\d+) {2}(\d\d:\d\d) ΔT (MIN|AVG) (-?\d+\.\d) °C {2}SIMULATED$/.exec(label);
    expect(m, label).not.toBeNull();
    expect(m![2]).toBe((await page.getByTestId('result-spi').innerText()).trim());
    expect(m![3]).toBe('22:48');
    // Three temperatures, three names: the row is ΔT AVG, the cold spot line and the strip are ΔT MIN
    // on STRONG and CRITICAL (the same figure), and the strip carries ΔT AVG below them.
    if (demo === 'strong' || demo === 'critical') {
      expect(m![4]).toBe('MIN');
      expect(await page.getByTestId('result-coldspot').innerText()).toContain(`ΔT MIN ${m![5]} °C`);
    } else {
      expect(m![4]).toBe('AVG');
      expect((await page.getByText(/^ΔT\sAVG\s+-?\d/).first().innerText()).replace(/\s+/g, ' ')).toContain(m![5]);
    }
    // The duplicate CASE band over the photo's top edge is gone: CASE prints once, in the strip (A-42).
    await expect(page.getByText(/^CASE \d{4}$/)).toHaveCount(0);
    const photo = (await page.getByTestId('result-photo').boundingBox())!;
    const box = (await strip.boundingBox())!;
    expect(box.x).toBeLessThan(photo.x + 4);
    expect(box.y + box.height).toBeGreaterThan(photo.y + photo.height - 4);
    expect(box.y).toBeGreaterThan(photo.y + photo.height / 2);
    // Drawn into a canvas on the photo, under the glass overlay (the overlay comes later in the tree).
    await expect(strip.locator('canvas')).toHaveCount(1);
    // D-034, D-041: the strip is a disclosure and stays on the THERM view, the mark last.
    await page.getByTestId('key-therm').click();
    await expect(page.getByTestId('thermal-view')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('result-stamp')).toHaveCount(1);
    expect(((await strip.getAttribute('aria-label')) ?? '').trim().endsWith('SIMULATED')).toBe(true);
  });
}

test('QUIET over a black photo prints the auto-gain on the strip, SIMULATED last', async ({ page }) => {
  const check = watch(page);
  await page.goto('/result/demo?static=1&fixture=black&demo=quiet');
  await expect(page.getByTestId('screen-result')).toBeVisible();
  await settle(page);
  const label = (await page.getByTestId('result-stamp').getAttribute('aria-label')) ?? '';
  expect(label).toMatch(/GAIN \+(6|12|18|24) dB/);
  expect(label.endsWith('SIMULATED')).toBe(true);
  check();
});

test('QUIET over a lit photo prints no GAIN', async ({ page }) => {
  const check = watch(page);
  await page.goto('/result/demo?static=1&fixture=bright&demo=quiet');
  await expect(page.getByTestId('screen-result')).toBeVisible();
  await settle(page);
  expect((await page.getByTestId('result-stamp').getAttribute('aria-label')) ?? '').not.toContain('GAIN');
  check();
});
