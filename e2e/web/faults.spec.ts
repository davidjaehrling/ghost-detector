import { expect, test, type Page } from '@playwright/test';

// P8-05. Fault injection through ?fault=<name> (src/state/faults.web.ts and the web backends). Each
// case runs one failure and asserts the flow ends in a defined state with no console error and no
// uncaught page error. The render fault is the one case that logs on purpose: React reports an error
// a boundary caught through console.error, so exactly that injected message is allowed there.

test.setTimeout(120_000);

function watch(page: Page, allow: RegExp | null = null) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !(allow && allow.test(msg.text()))) consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  return () => {
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  };
}

type Entry = { call: string };
const adsLog = (page: Page) => page.evaluate(() => ((window.__adsLog ?? []) as Entry[]).map((e) => e.call));
const analyticsLog = (page: Page) => page.evaluate(() => (window.__analyticsLog ?? []).filter((e) => e.name === 'fault'));

const DEMO = '/result/demo?static=1&fixture=cellar&demo=strong';
const ACTIVE = '/result/demo?static=1&fixture=cellar&demo=active';
const INJECTED = /injected render fault/;

async function scanOnce(page: Page) {
  await expect(page.getByTestId('screen-viewfinder').last()).toBeVisible();
  await page.getByTestId('key-capture').last().click();
  await expect(page.getByTestId('screen-result').last()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('result-tier').last()).toBeVisible();
}

test('camera-denied: the viewfinder shows the denied notice, ALLOW stays, CAPTURE still scans the stored frame', async ({ page }) => {
  const check = watch(page);
  await page.goto('/viewfinder?static=1&speed=8&fault=camera-denied');
  await expect(page.getByTestId('permission-denied')).toBeVisible();
  await expect(page.getByTestId('key-allow')).toBeVisible();
  await page.getByTestId('key-allow').click();
  await expect(page.getByTestId('permission-denied')).toBeVisible();
  await scanOnce(page);
  check();
});

test('camera-revoked: live first, then the permission goes mid-session and the screen degrades in place', async ({ page }) => {
  const check = watch(page);
  await page.goto('/viewfinder?static=1&speed=8&fault=camera-revoked');
  await expect(page.getByTestId('screen-viewfinder').last()).toBeVisible();
  await expect(page.getByTestId('hud-state')).toBeVisible();
  await expect(page.getByTestId('permission-denied')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('key-allow')).toBeVisible();
  await scanOnce(page);
  check();
});

test('storage-write: a scan completes and the result opens with nothing persisted', async ({ page }) => {
  const check = watch(page);
  await page.goto('/viewfinder?static=1&speed=8&session=0&fault=storage-write');
  await scanOnce(page);
  await page.getByTestId('screen-result').last().getByTestId('key-back').click();
  await expect(page.getByTestId('screen-viewfinder').last()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('fs4.scans.v1'))).toBeNull();
  await page.getByTestId('key-log').last().click();
  await expect(page.getByTestId('screen-history').last()).toBeVisible();
  await page.getByTestId('key-forward').last().click();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await page.getByTestId('setting-jumpscares').click();
  check();
});

test('storage-read: history, settings and the viewfinder open on defaults', async ({ page }) => {
  const check = watch(page);
  await page.goto('/history?static=1&log=demo3&fault=storage-read');
  await expect(page.getByTestId('screen-history').last()).toBeVisible();
  await page.goto('/settings?static=1&fault=storage-read');
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await page.goto('/viewfinder?static=1&speed=8&fault=storage-read');
  await scanOnce(page);
  check();
});

test('skia: CanvasKit fails to load and the OPTICS OFFLINE screen stands in; RESET reloads the page', async ({ page }) => {
  const check = watch(page);
  await page.goto('/viewfinder?static=1&fault=skia');
  await expect(page.getByTestId('screen-fault')).toBeVisible();
  await expect(page.getByTestId('screen-fault')).toContainText('E-52 OPTICS OFFLINE');
  await expect(page.getByTestId('screen-fault')).toContainText('DISPLAY CORE DID NOT START.');
  await expect.poll(() => analyticsLog(page)).toEqual([{ name: 'fault', params: { code: 'E-52' } }]);
  const reloaded = page.waitForEvent('load');
  await page.getByTestId('key-reset').click();
  await reloaded;
  await expect(page.getByTestId('screen-fault')).toBeVisible();
  check();
});

test('ad-load: no ad loads, DEEP SCAN reads OFFLINE and no interstitial shows', async ({ page }) => {
  const check = watch(page);
  await page.goto(`${DEMO}&fault=ad-load`);
  const key = page.getByTestId('deepscan-key');
  await expect.poll(() => key.evaluate((e) => getComputedStyle(e.querySelector('div') as HTMLElement).color)).toBe('rgb(74, 77, 66)');
  await expect(key).toHaveText('OFFLINE');
  await expect(page.getByTestId('deepscan-line')).toHaveText('DEEP SCAN OFFLINE. NO SIGNAL.');
  await page.goto('/viewfinder?static=1&speed=8&session=1&fault=ad-load');
  await scanOnce(page);
  await page.getByTestId('screen-result').last().getByTestId('key-back').click();
  await expect(page.getByTestId('screen-viewfinder').last()).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await adsLog(page)).not.toContain('interstitialShow');
  check();
});

test('consent-timeout: the info update never answers, ads stay off, nothing initialises', async ({ page }) => {
  const check = watch(page);
  await page.goto(`${DEMO}&fault=consent-timeout`);
  await expect.poll(() => page.getByTestId('deepscan-key').evaluate((e) => getComputedStyle(e.querySelector('div') as HTMLElement).color), { timeout: 15_000 }).toBe('rgb(74, 77, 66)');
  await expect(page.getByTestId('deepscan-key')).toHaveText('OFFLINE');
  await expect(page.getByTestId('deepscan-line')).toHaveText('DEEP SCAN OFFLINE. NO SIGNAL.');
  const calls = await adsLog(page);
  expect(calls).toContain('requestInfoUpdate');
  expect(calls).not.toContain('initialize');
  expect(calls).not.toContain('rewardedLoad');
  check();
});

test('share-cancel: the sheet is closed without a target; the screen returns quietly, no E-31, no log entry', async ({ page }) => {
  const check = watch(page);
  await page.goto(`${ACTIVE}&share=format&fault=share-cancel`);
  await expect(page.getByTestId('share-panel')).toBeVisible();
  await page.getByTestId('share-916').click();
  await expect(page.getByTestId('share-panel')).toHaveCount(0, { timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => window.__shareCancelled ?? 0)).toBe(1);
  expect(await page.evaluate(() => (window.__shareLog ?? []).length)).toBe(0);
  await expect(page.getByText('E-31')).toHaveCount(0);
  await expect(page.getByTestId('key-share')).toBeEnabled();
  check();
});

test('notify-denied: the relay reports the denial and Settings shows it OFF', async ({ page }) => {
  const check = watch(page);
  await page.goto('/history?static=1&log=demo3&session=1&fault=notify-denied');
  await page.getByTestId('history-row-0001').filter({ visible: true }).click();
  await page.getByTestId('screen-result').last().getByTestId('key-back').click();
  await expect(page.getByTestId('screen-viewfinder').last()).toBeVisible();
  await page.getByTestId('relay-fit').click();
  await expect(page.getByTestId('relay-result')).toHaveText('Relay not fitted. Change in Settings.');
  await page.getByTestId('relay-result-box').click();
  await page.getByTestId('key-log').last().click();
  await page.getByTestId('key-forward').last().click();
  await expect(page.getByTestId('setting-relay-state')).toHaveText('OFF');
  check();
});

test('locale-missing: a chosen language with no table falls back to English per key', async ({ page }) => {
  const check = watch(page);
  await page.goto('/settings?static=1&lang=en');
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  const english = await page.getByTestId('settings-list').innerText();
  await page.goto('/settings?static=1&lang=de');
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  expect(await page.getByTestId('settings-list').innerText()).not.toBe(english);
  await page.goto('/settings?static=1&lang=de&fault=locale-missing');
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  expect(await page.getByTestId('settings-list').innerText()).toBe(english);
  check();
});

for (const route of ['/history?static=1&log=demo3', '/settings?static=1']) {
  test(`render fault on ${route.split('?')[0]}: the route boundary shows E-60 and RESET remounts the route`, async ({ page }) => {
    const check = watch(page, INJECTED);
    await page.goto(`${route}&fault=render`);
    const fault = page.getByTestId('screen-fault');
    await expect(fault).toBeVisible();
    await expect(fault).toContainText('E-60 UNIT FAULT');
    await expect(fault).toContainText('PRESS RESET.');
    await expect.poll(() => analyticsLog(page)).toEqual([{ name: 'fault', params: { code: 'E-60' } }]);
    await page.getByTestId('key-reset').click();
    await expect(page.getByTestId(route.startsWith('/history') ? 'screen-history' : 'screen-settings').last()).toBeVisible();
    await expect(page.getByTestId('screen-fault')).toHaveCount(0);
    check();
  });
}

test('fault screen golden', async ({ page }, testInfo) => {
  const de = testInfo.project.name === 'android-360x800';
  test.skip(!de && testInfo.project.name !== 'android-390x844', 'goldens at 390 (en) and 360 (de)');
  const check = watch(page, INJECTED);
  await page.goto(`/settings?static=1&fault=render${de ? '&lang=de' : ''}`);
  await expect(page.getByTestId('screen-fault')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByTestId('screen-fault')).toContainText(de ? 'E-60 GERÄTEFEHLER' : 'E-60 UNIT FAULT');
  const name = de ? 'fault-screen-de-360.png' : 'fault-screen.png';
  await page.screenshot({ path: `e2e/screenshots/current/${testInfo.project.name}/${name}` });
  await expect(page).toHaveScreenshot(name, { maxDiffPixels: 150 });
  check();
});
