import { expect, test, type Page } from '@playwright/test';

// P6-05 part 1. The FIELD LOG RELAY opt-in on the viewfinder and the Settings RELAY row.
// The log demo seeds six cases (session=1 lifts the first-session rule), so the first return from a
// result is eligible. The web stub records every call in window.__notifyLog.

const BODY =
  'Fit the relay? The unit posts at most one field-log line a night: the index, the moon or an open case. 18:00 to 22:00 only. Lines are simulated, like every reading.';

const calls = (page: Page) => page.evaluate(() => (window.__notifyLog ?? []).map((e) => e.call));

async function backFromACase(page: Page) {
  await page.getByTestId('history-row-0001').filter({ visible: true }).click();
  const result = page.getByTestId('screen-result').last();
  await expect(result).toBeVisible();
  // Never on a result screen.
  await expect(page.getByTestId('relay-module')).toHaveCount(0);
  await result.getByTestId('key-back').click();
  await expect(page.getByTestId('screen-viewfinder').last()).toBeVisible();
}

async function toSettings(page: Page) {
  await page.getByTestId('key-log').last().click();
  await expect(page.getByTestId('screen-history').last()).toBeVisible();
  await page.getByTestId('key-forward').last().click();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
}

const start = (page: Page, extra = '') => page.goto(`/history?static=1&log=demo3&session=1${extra}`);

test('the opt-in: module copy, equal keys, permission only on FIT RELAY, result line, once only', async ({ page }) => {
  await start(page, '&notify=granted');
  await backFromACase(page);
  const mod = page.getByTestId('relay-module');
  await expect(mod).toBeVisible();
  await expect(mod).toContainText('FIELD LOG RELAY');
  await expect(page.getByTestId('relay-body')).toHaveText(BODY);
  // Nothing has been requested yet: the dialog follows the tap.
  expect(await calls(page)).toEqual([]);
  // Equal keys: same box, same type.
  const [a, b] = await Promise.all(['relay-fit', 'relay-notnow'].map((id) => page.getByTestId(id).boundingBox()));
  expect(Math.round(a!.width)).toBe(Math.round(b!.width));
  expect(Math.round(a!.height)).toBe(Math.round(b!.height));
  const style = (id: string) =>
    page.getByTestId(id).evaluate((e) => {
      const t = e.querySelector('div') as HTMLElement;
      const cs = getComputedStyle(t);
      const bs = getComputedStyle(e);
      return [cs.color, cs.fontSize, cs.fontWeight, cs.fontFamily, bs.backgroundColor, bs.borderColor];
    });
  expect(await style('relay-fit')).toEqual(await style('relay-notnow'));
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('relay-module.png', { maxDiffPixels: 150 });

  await page.getByTestId('relay-fit').click();
  await expect(page.getByTestId('relay-result')).toHaveText('Relay fitted. Change in Settings.');
  expect(await calls(page)).toEqual(['createChannel:field-log', 'requestPermission']);
  await page.getByTestId('relay-result-box').click();
  await expect(page.getByTestId('relay-module')).toHaveCount(0);

  // Once only: another return from a result shows nothing.
  await page.getByTestId('key-log').last().click();
  await backFromACase(page);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('relay-module')).toHaveCount(0);
  expect((await calls(page)).filter((c) => c === 'requestPermission')).toHaveLength(1);
});

test('a system denial reports it, and the Settings row opens system settings without asking again', async ({ page }) => {
  await start(page, '&notify=denied');
  await backFromACase(page);
  await page.getByTestId('relay-fit').click();
  await expect(page.getByTestId('relay-result')).toHaveText('Relay not fitted. Change in Settings.');
  await page.getByTestId('relay-result-box').click();
  await toSettings(page);
  await expect(page.getByTestId('setting-relay-state')).toHaveText('OFF');
  await expect(page.getByTestId('settings-relay-note')).toBeVisible();
  await page.getByTestId('setting-relay').click();
  await expect.poll(() => calls(page)).toContain('openSystemSettings');
  expect((await calls(page)).filter((c) => c === 'requestPermission')).toHaveLength(1);
  await expect(page.getByTestId('setting-relay-state')).toHaveText('OFF');
});

test('NOT NOW is final: no request, no second module, a RELAY row in Settings', async ({ page }) => {
  await start(page, '&notify=granted');
  await backFromACase(page);
  await page.getByTestId('relay-notnow').click();
  await expect(page.getByTestId('relay-module')).toHaveCount(0);
  expect(await calls(page)).toEqual([]);
  await page.getByTestId('key-log').last().click();
  await backFromACase(page);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('relay-module')).toHaveCount(0);
  await toSettings(page);
  await expect(page.getByTestId('setting-relay')).toBeVisible();
  await expect(page.getByTestId('setting-relay-state')).toHaveText('OFF');
  await page.getByTestId('setting-relay').click();
  await expect(page.getByTestId('setting-relay-state')).toHaveText('ON');
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('settings-relay-on.png', { maxDiffPixels: 150 });
  await page.getByTestId('setting-relay').click();
  await expect(page.getByTestId('setting-relay-state')).toHaveText('OFF');
});

test('the Settings row is off by default and the module is absent before the trigger', async ({ page }) => {
  await page.goto('/settings?static=1');
  await expect(page.getByTestId('setting-relay-state')).toHaveText('OFF');
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('settings-relay-off.png', { maxDiffPixels: 150 });
});

test('the first session never shows the module, even with cases on file', async ({ page }) => {
  await page.goto('/history?static=1&log=demo3');
  await backFromACase(page);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('relay-module')).toHaveCount(0);
});
