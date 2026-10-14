import { expect, test, type Page } from '@playwright/test';
import { waitWarped } from './warped';

// P5-04. ?static=1&demo=strong builds the result from a fixed seed. The web ads stub takes
// ?adReady=0 (the rewarded ad never loads) and ?reward=1|0 (whether the fake show earns it).
// ?deepscan=unlocked starts the demo record unlocked. A real scan (/scan?seed=41, a STRONG with a
// figure) is saved, so it also covers the unlock persisting on the record.

const SUB = 'SPONSORED VIDEO PLAYS FIRST';
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

const adsLog = (page: Page) => page.evaluate(() => (window.__adsLog ?? []).map((e) => e.call));

test('locked: the key is live with the sponsored sublabel', async ({ page }, testInfo) => {
  const check = watch(page);
  await page.goto(DEMO);
  const key = page.getByTestId('deepscan-key');
  await expect(key).toBeEnabled();
  await expect(key).toHaveText('DEEP SCAN');
  await expect(page.getByTestId('deepscan-sub')).toHaveText(SUB);
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
  await expect(key).toBeDisabled();
  await expect(key).toHaveText(OFFLINE);
  await expect(page.getByTestId('deepscan-sub')).toHaveText(SUB);
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
  await expect(page.getByTestId('deepscan-sub')).toHaveCount(0);
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
  const key = page.getByTestId('deepscan-key');
  await expect(key).toBeEnabled();
  expect(await adsLog(page)).not.toContain('rewardedShow');
  await key.click();
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
  await expect(key).toBeEnabled();
  await key.click();
  await expect.poll(async () => (await adsLog(page)).filter((c) => c === 'rewardedShow').length).toBe(1);
  await expect(key).toBeEnabled();
  await expect(key).toHaveText('DEEP SCAN');
  await expect(page.getByTestId('deepscan-sub')).toHaveText(SUB);
  await expect(page.getByTestId('profile-mask')).toHaveCount(3);
  await expect(page.getByTestId('result-decoded')).toContainText('SIGNATURE PARTIALLY DECODED:');
  // No automatic re-offer: one fresh ad is requested for the dismissed slot and nothing is shown
  // until the person taps again.
  await page.waitForTimeout(700);
  let log = await adsLog(page);
  expect(log.filter((c) => c === 'rewardedShow')).toHaveLength(1);
  expect(log.filter((c) => c === 'rewardedLoad')).toHaveLength(2);
  await expect(key).toBeEnabled();
  await expect(key).toHaveText('DEEP SCAN');
  await expect(page.getByTestId('deepscan-done')).toHaveCount(0);
  await expect(page.getByTestId('profile-mask')).toHaveCount(3);
  // A second, explicit tap plays the fresh ad; the scan stays locked because no reward is earned.
  await key.click();
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
  await expect(page.getByTestId('deepscan-key')).toHaveText(OFFLINE);
  await expect(page.getByTestId('deepscan-key')).toBeDisabled();
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
