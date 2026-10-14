import { expect, test, type Page } from '@playwright/test';
import { waitWarped } from './warped';

// P5-04, reworked for D-045 ruling 1: DEEP SCAN is hardware key 4 with a two-step arm. The first press
// lights the key and prints the sponsored-video line directly above it; the second press runs the ad.
// ?static=1&demo=strong builds the result from a fixed seed. The web ads stub takes
// ?adReady=0 (the rewarded ad never loads) and ?reward=1|0 (whether the fake show earns it).
// ?deepscan=unlocked starts the demo record unlocked. A real scan (/scan?seed=41, a STRONG with a
// figure) is saved, so it also covers the unlock persisting on the record.

const ARM = 'Resolves class, era, EVP. Sponsored video plays first. DEEP SCAN again to run.';
const OFFLINE = 'DEEP SCAN OFFLINE. NO SIGNAL.';
const DEMO = '/result/demo?static=1&fixture=cellar&demo=strong';

function watch(page: Page) {
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

const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function settle(page: Page) {
  await expect(page.getByTestId('result-photo')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0));
  await expect(page.getByTestId('result-stamp')).toHaveAttribute('aria-busy', 'false');
  await frames(page);
  await waitWarped(page);
}

// Arm, then run: the first press is past the 500 ms guard, the second starts the ad.
async function pressTwice(page: Page) {
  const key = page.getByTestId('deepscan-key');
  await page.waitForTimeout(700);
  await key.click();
  await expect(page.getByTestId('deepscan-line')).toHaveText(ARM);
  await key.click();
}

// Key 4 is a hardware cap: dead means the n4 engraved legend (rgb 74, 77, 66), live is anything brighter.
const INERT = 'rgb(74, 77, 66)';
const legendColor = (page: Page) => page.getByTestId('deepscan-key').evaluate((e) => getComputedStyle(e.querySelector('div') as HTMLElement).color);
const live = (page: Page) => expect.poll(() => legendColor(page), { timeout: 15_000 }).not.toBe(INERT);
const dead = (page: Page) => expect.poll(() => legendColor(page), { timeout: 15_000 }).toBe(INERT);

const adsLog = (page: Page) => page.evaluate(() => (window.__adsLog ?? []).map((e) => e.call));

test('locked: the key is live with the sponsored sublabel', async ({ page }, testInfo) => {
  const check = watch(page);
  await page.goto(DEMO);
  const key = page.getByTestId('deepscan-key');
  await live(page);
  await expect(key).toHaveText('DEEP SCAN');
  // Nothing sponsored prints before the first press; the key's accessible name carries the sentence.
  await expect(page.getByTestId('deepscan-line')).toHaveCount(0);
  await expect(key).toHaveAccessibleName(`Deep scan. ${ARM}`);
  await expect(page.getByTestId('result-decoded')).toContainText('SIGNATURE PARTIALLY DECODED:');
  await expect(page.getByTestId('profile-mask')).toHaveCount(3);
  // The ad was requested on mount (preload), not shown.
  expect(await adsLog(page)).toContain('rewardedLoad');
  expect(await adsLog(page)).not.toContain('rewardedShow');
  await settle(page);
  await page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/result-deepscan-locked.png` });
  await expect(page).toHaveScreenshot('result-deepscan-locked.png', { maxDiffPixels: 150 });
  check();
});

test('offline: no ad loads, the key is disabled and says why, the sublabel stays', async ({ page }, testInfo) => {
  const check = watch(page);
  await page.goto(`${DEMO}&adReady=0`);
  const key = page.getByTestId('deepscan-key');
  await dead(page);
  await expect(key).toHaveText('OFFLINE');
  await expect(page.getByTestId('deepscan-line')).toHaveText(OFFLINE);
  await key.click({ force: true });
  expect(await adsLog(page)).not.toContain('rewardedShow');
  await settle(page);
  await page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/result-deepscan-offline.png` });
  await expect(page).toHaveScreenshot('result-deepscan-offline.png', { maxDiffPixels: 150 });
  check();
});

test('unlocked: designation, behaviour and EVP are printed and the signature is whole', async ({ page }, testInfo) => {
  const check = watch(page);
  await page.goto(`${DEMO}&deepscan=unlocked`);
  await expect(page.getByTestId('deepscan-done')).toHaveText('DEEP SCAN COMPLETE.');
  await expect(page.getByTestId('deepscan-key')).toHaveCount(0);
  await expect(page.getByTestId('deepscan-line')).toHaveCount(0);
  await expect(page.getByTestId('profile-mask')).toHaveCount(0);
  await expect(page.getByTestId('profile-name')).toHaveText(/\S/);
  await expect(page.getByTestId('profile-behaviour')).toHaveText(/\S/);
  await expect(page.getByTestId('profile-evp')).toHaveText(/^".+"$/);
  await expect(page.getByTestId('result-decoded')).toHaveText('SIGNATURE DECODED: 100%');
  // No ad is requested for a scan that is already unlocked.
  expect(await adsLog(page)).not.toContain('rewardedLoad');
  await settle(page);
  await page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/result-deepscan-unlocked.png` });
  await expect(page).toHaveScreenshot('result-deepscan-unlocked.png', { maxDiffPixels: 150 });
  check();
});

test('reward earned: the ad plays on the tap only, the scan unlocks and stays unlocked after a reload', async ({ page }) => {
  const check = watch(page);
  await page.goto('/scan?static=1&seed=41&speed=8&fixture=cellar');
  await expect(page.getByTestId('screen-result')).toBeVisible({ timeout: 15_000 });
  const url = page.url();
  await live(page);
  expect(await adsLog(page)).not.toContain('rewardedShow');
  await pressTwice(page);
  await expect(page.getByTestId('deepscan-done')).toBeVisible();
  expect((await adsLog(page)).filter((c) => c === 'rewardedShow')).toHaveLength(1);
  await expect(page.getByTestId('profile-evp')).toHaveText(/^".+"$/);
  // Reopened from its case number (what History does): still unlocked, and no new ad is loaded.
  await page.goto(url.replace(/\?.*$/, '') + '?static=1&fixture=cellar');
  await expect(page.getByTestId('deepscan-done')).toBeVisible();
  await expect(page.getByTestId('profile-evp')).toHaveText(/^".+"$/);
  expect(await adsLog(page)).not.toContain('rewardedLoad');
  check();
});

test('dismissed without the reward: nothing changes and a second tap may play a fresh ad', async ({ page }) => {
  const check = watch(page);
  await page.goto('/scan?static=1&seed=41&speed=8&fixture=cellar&reward=0');
  await expect(page.getByTestId('screen-result')).toBeVisible({ timeout: 15_000 });
  const key = page.getByTestId('deepscan-key');
  await live(page);
  await pressTwice(page);
  await expect.poll(async () => (await adsLog(page)).filter((c) => c === 'rewardedShow').length).toBe(1);
  await live(page);
  await expect(key).toHaveText('DEEP SCAN');
  // The decline spent the arm: nothing prints above the key until it is pressed again.
  await expect(page.getByTestId('deepscan-line')).toHaveCount(0);
  await expect(page.getByTestId('profile-mask')).toHaveCount(3);
  await expect(page.getByTestId('result-decoded')).toContainText('SIGNATURE PARTIALLY DECODED:');
  // No automatic re-offer: one fresh ad is requested for the dismissed slot and nothing is shown
  // until the person taps again.
  await page.waitForTimeout(700);
  let log = await adsLog(page);
  expect(log.filter((c) => c === 'rewardedShow')).toHaveLength(1);
  expect(log.filter((c) => c === 'rewardedLoad')).toHaveLength(2);
  await live(page);
  await expect(key).toHaveText('DEEP SCAN');
  await expect(page.getByTestId('deepscan-done')).toHaveCount(0);
  await expect(page.getByTestId('profile-mask')).toHaveCount(3);
  // A second, explicit pair of presses plays the fresh ad; the scan stays locked because no reward is earned.
  await pressTwice(page);
  await expect.poll(async () => (await adsLog(page)).filter((c) => c === 'rewardedShow').length).toBe(2);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('deepscan-done')).toHaveCount(0);
  await expect(page.getByTestId('profile-mask')).toHaveCount(3);
  log = await adsLog(page);
  expect(log.filter((c) => c === 'rewardedShow')).toHaveLength(2);
  check();
});

test('no consent to request ads: the key is offline and nothing is requested', async ({ page }) => {
  const check = watch(page);
  await page.goto(`${DEMO}&consent=denied`);
  await expect(page.getByTestId('deepscan-key')).toHaveText('OFFLINE');
  await expect(page.getByTestId('deepscan-line')).toHaveText(OFFLINE);
  await dead(page);
  expect(await adsLog(page)).not.toContain('rewardedLoad');
  expect(await adsLog(page)).not.toContain('initialize');
  check();
});

test('QUIET carries no DEEP SCAN key and requests no rewarded ad', async ({ page }) => {
  await page.goto('/result/demo?static=1&fixture=cellar&demo=quiet');
  await expect(page.getByTestId('screen-result')).toBeVisible();
  await expect(page.getByTestId('deepscan-key')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await adsLog(page)).not.toContain('rewardedLoad');
});

test('the first press arms the key and prints the line; no ad until the second press', async ({ page }) => {
  const check = watch(page);
  await page.goto(DEMO);
  const key = page.getByTestId('deepscan-key');
  await live(page);
  await page.waitForTimeout(700);
  const legend = (id: string) => page.getByTestId(id).evaluate((e) => getComputedStyle(e.querySelector('div') as HTMLElement).color);
  const dim = await legend('deepscan-key');
  await key.click();
  await expect(page.getByTestId('deepscan-line')).toHaveText(ARM);
  // Lit: the legend moves to p5 (212, 255, 220).
  expect(await legend('deepscan-key')).not.toBe(dim);
  expect(await legend('deepscan-key')).toBe('rgb(212, 255, 220)');
  await page.waitForTimeout(300);
  expect(await adsLog(page)).not.toContain('rewardedShow');
  await key.click();
  await expect.poll(async () => (await adsLog(page)).filter((c) => c === 'rewardedShow').length).toBe(1);
  // Armed state is spent: the line is gone and the key is dark again once the reward lands.
  await expect(page.getByTestId('deepscan-done')).toBeVisible();
  await expect(page.getByTestId('deepscan-line')).toHaveCount(0);
  check();
});

for (const other of ['key-therm', 'key-share', 'key-back'] as const) {
  test(`${other} cancels the arm: the line goes and the next press only arms again`, async ({ page }) => {
    const check = watch(page);
    await page.goto(`${DEMO}&deeparm=1`);
    await expect(page.getByTestId('deepscan-line')).toHaveText(ARM);
    await page.waitForTimeout(700);
    await page.getByTestId(other).click();
    if (other === 'key-back') {
      await expect(page.getByTestId('screen-viewfinder').last()).toBeVisible();
      expect(await adsLog(page)).not.toContain('rewardedShow');
      check();
      return;
    }
    if (other === 'key-share') {
      // The share moment takes key 4 and the line; cancelling the format returns a disarmed key.
      await expect(page.getByTestId('deepscan-line')).toHaveCount(0);
      await page.getByTestId('key-back').click();
      await expect(page.getByTestId('key-share')).toBeVisible();
    } else {
      await expect(page.getByTestId('key-therm')).toHaveText('PHOTO');
    }
    await expect(page.getByTestId('deepscan-line')).toHaveCount(0);
    expect(await adsLog(page)).not.toContain('rewardedShow');
    await page.getByTestId('deepscan-key').click();
    await expect(page.getByTestId('deepscan-line')).toHaveText(ARM);
    expect(await adsLog(page)).not.toContain('rewardedShow');
    check();
  });
}

test('no ad from a press within 500 ms of the result appearing', async ({ page }) => {
  const check = watch(page);
  // A page clock the test can push back: Date.now() reads base + elapsed + skew.
  await page.addInitScript(() => {
    const w = window as unknown as { __skew: number };
    w.__skew = 0;
    const base = Date.now();
    const t0 = performance.now();
    Date.now = () => base + (performance.now() - t0) + w.__skew;
  });
  await page.goto(DEMO);
  const key = page.getByTestId('deepscan-key');
  await live(page);
  await page.waitForTimeout(700);
  // From the page's point of view the result appeared a moment ago: presses are ignored, armed or not.
  await page.evaluate(() => ((window as unknown as { __skew: number }).__skew = -100_000));
  await key.click();
  await key.click();
  await page.waitForTimeout(200);
  await expect(page.getByTestId('deepscan-line')).toHaveCount(0);
  expect(await adsLog(page)).not.toContain('rewardedShow');
  // Past the guard the same two presses arm and run.
  await page.evaluate(() => ((window as unknown as { __skew: number }).__skew = 0));
  await key.click();
  await expect(page.getByTestId('deepscan-line')).toHaveText(ARM);
  await key.click();
  await expect.poll(async () => (await adsLog(page)).filter((c) => c === 'rewardedShow').length).toBe(1);
  check();
});

test('the line is absent whenever key 4 is dark: QUIET, TRACE, share offer, format, printing, fault', async ({ page }) => {
  const check = watch(page);
  const line = page.getByTestId('deepscan-line');
  const key = page.getByTestId('deepscan-key');
  for (const url of ['/result/demo?static=1&fixture=cellar&demo=quiet', '/result/demo?static=1&fixture=cellar&demo=quiet&seed=6']) {
    await page.goto(`${url}&deeparm=1`);
    await expect(page.getByTestId('screen-result')).toBeVisible();
    await expect(key).toHaveCount(0);
    await expect(line).toHaveCount(0);
  }
  for (const share of ['offer', 'format']) {
    await page.goto(`${DEMO}&deeparm=1&share=${share}`);
    await expect(page.getByTestId('screen-result')).toBeVisible();
    await page.waitForTimeout(300);
    await expect(key).toHaveCount(0);
    await expect(line).toHaveCount(0);
  }
  // The printer fault: format, a card, E-31. Key and line stay away while the fault line is up.
  await page.goto(`${DEMO}&deeparm=1&share=fail`);
  await page.getByTestId('key-share').click();
  await page.getByTestId('share-11').click();
  await expect(page.getByTestId('result-line')).toHaveText('E-31 PRINTER FAULT. CARD NOT SAVED.');
  await expect(key).toHaveCount(0);
  await expect(line).toHaveCount(0);
  check();
});

// A-43 geometry: the line sits directly above key 4 on the glass, at key 4's right edge, with nothing between,
// at legend size or larger, p4 or brighter, reflowing to two lines and never clipped.
const LANGS = ['en', 'de', 'es', 'pt'] as const;
for (const lang of LANGS) {
  test(`the sponsored line sits directly above key 4 (${lang})`, async ({ page }, testInfo) => {
    const check = watch(page);
    await page.goto(`${DEMO}&deeparm=1&lang=${lang}`);
    const key = page.getByTestId('deepscan-key');
    const line = page.getByTestId('deepscan-line');
    await expect(line).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const k = (await key.boundingBox())!;
    const g = (await page.getByTestId('screen-result-glass').boundingBox())!;
    const info = await line.evaluate((e) => {
      const r = document.createRange();
      r.selectNodeContents(e);
      const rects = Array.from(r.getClientRects()).filter((q) => q.width > 0);
      const ink = r.getBoundingClientRect();
      const cs = getComputedStyle(e);
      const box = e.getBoundingClientRect();
      // Elements between the line and key 4, sampled across key 4's column at mid-height of the gap.
      return {
        tops: [...new Set(rects.map((q) => Math.round(q.top / 4)))].length,
        ink: { l: ink.left, r: ink.right, t: ink.top, b: ink.bottom },
        box: { l: box.left, r: box.right, t: box.top, b: box.bottom },
        size: parseFloat(cs.fontSize),
        color: cs.color,
        text: e.textContent,
      };
    });
    const legendSize = await key.evaluate((e) => parseFloat(getComputedStyle(e.querySelector('div') as HTMLElement).fontSize));
    // Two lines at most, never clipped: every glyph inside the glass and above key 4.
    expect(info.tops, `${info.text}`).toBeLessThanOrEqual(2);
    expect(info.ink.l).toBeGreaterThanOrEqual(g.x);
    expect(info.ink.r).toBeLessThanOrEqual(g.x + g.width + 0.5);
    expect(info.ink.b).toBeLessThanOrEqual(g.y + g.height + 0.5);
    // Horizontal overlap with key 4 and the line's right edge over it.
    expect(Math.min(info.box.r, k.x + k.width) - Math.max(info.box.l, k.x)).toBeGreaterThan(0);
    expect(info.ink.r).toBeGreaterThan(k.x);
    // Directly above: the line's bottom is above key 4 and within one housing gap (glass to key row) of it.
    const gap = k.y - (g.y + g.height);
    expect(info.ink.b).toBeLessThanOrEqual(k.y);
    expect(k.y - info.ink.b, `gap to key 4`).toBeLessThanOrEqual(gap + 12);
    // Nothing between: only housing and the glass sit in the band between the line and key 4 over key 4's column.
    const between = await page.evaluate(
      ({ x, y0, y1 }) => {
        const ids = new Set<string>();
        for (let y = y0; y <= y1; y += 2) for (const el of document.elementsFromPoint(x, y)) {
          const id = el.getAttribute('data-testid');
          if (id) ids.add(id);
        }
        return [...ids];
      },
      { x: k.x + k.width / 2, y0: info.ink.b + 1, y1: k.y - 1 },
    );
    expect(between.filter((id) => !/^screen-result/.test(id)), 'elements between').toEqual([]);
    // Legend size or larger, p4 or brighter.
    expect(info.size).toBeGreaterThanOrEqual(legendSize);
    expect(['rgb(124, 232, 149)', 'rgb(212, 255, 220)']).toContain(info.color);
    // German at 360 reflows to two lines.
    if (lang === 'de' && testInfo.project.name === 'android-360x800') expect(info.tops).toBe(2);
    check();
  });
}

test('the geometry test fails when the line moves away from key 4', async ({ page }) => {
  // Mutation guard for the bounding-box test: shifting the line far above key 4 breaks the distance clause.
  await page.goto(`${DEMO}&deeparm=1`);
  const line = page.getByTestId('deepscan-line');
  await expect(line).toBeVisible();
  const k = (await page.getByTestId('deepscan-key').boundingBox())!;
  const before = await line.evaluate((e) => e.getBoundingClientRect().bottom);
  await line.evaluate((e) => ((e as HTMLElement).style.transform = 'translateY(-120px)'));
  const after = await line.evaluate((e) => e.getBoundingClientRect().bottom);
  const gap = k.y - (await page.getByTestId('screen-result-glass').boundingBox()!.then((g) => g!.y + g!.height));
  expect(k.y - before).toBeLessThanOrEqual(gap + 12);
  expect(k.y - after).toBeGreaterThan(gap + 12);
});

test('QUIET key 4 is LOG: it opens the log and never an interstitial', async ({ page }) => {
  test.setTimeout(120_000);
  const check = watch(page);
  // Session 1 with two earlier scans: the machine has an ad loaded and would show on a return from a result.
  await page.goto('/viewfinder?static=1&speed=8&session=1');
  await expect(page.getByTestId('key-capture').last()).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await page.getByTestId('key-capture').last().click();
    await expect(page.getByTestId('screen-result').last()).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('screen-result').last().getByTestId('key-back').click();
    await expect(page.getByTestId('screen-viewfinder').last()).toBeVisible();
  }
  // Seed a QUIET case and open its result.
  await page.goto('/result/demo?static=1&fixture=cellar&demo=quiet&session=1');
  const log = page.getByTestId('key-log');
  await expect(log).toHaveText('LOG');
  await expect(log).toHaveAccessibleName('Open history');
  const before = (await adsLog(page)).filter((c) => /^interstitial.*Show/i.test(c));
  await page.waitForTimeout(700);
  await log.click();
  await expect(page.getByTestId('screen-history').last()).toBeVisible();
  await page.waitForTimeout(1500);
  const after = (await adsLog(page)).filter((c) => /^interstitial.*Show/i.test(c));
  expect(after).toEqual(before);
  check();
});
