import { expect, test, type Page } from '@playwright/test';

// P5-05 and P5-06. The web ads stub logs every call to window.__adsLog. ?session=N sets the
// session index of the cold start (the persisted launch counter); the storage lives across the two
// page loads of one test, as the install's would across two launches.

// Each walk is several scans on a software-rendered page; the default 30 s is too tight.
test.setTimeout(120_000);

type Entry = { t: number; at: number; call: string };
const log = (page: Page) => page.evaluate(() => (window.__adsLog ?? []) as Entry[]);
const calls = async (page: Page) => (await log(page)).map((e) => e.call).filter((c) => /^interstitial/.test(c));

async function scanOnce(page: Page) {
  await expect(page.getByTestId('screen-viewfinder').last()).toBeVisible();
  await expect(page.getByTestId('key-capture').last()).toBeVisible();
  await page.getByTestId('key-capture').last().click();
  await expect(page.getByTestId('screen-result').last()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('result-tier').last()).toBeVisible();
}

// Taps NEW SCAN and returns the epoch ms of the tap (taken in the page, in the capture phase).
async function newScan(page: Page): Promise<number> {
  await page.evaluate(() => {
    (window as unknown as { __tap: number }).__tap = 0;
    document.addEventListener('click', () => ((window as unknown as { __tap: number }).__tap = Date.now()), { capture: true, once: true });
  });
  await page.getByTestId('screen-result').last().getByTestId('key-back').click();
  await expect(page.getByTestId('screen-viewfinder').last()).toBeVisible();
  return page.evaluate(() => (window as unknown as { __tap: number }).__tap);
}

test('two scans in session 0 and two in session 1: no show in session 0, one show in session 1 after its load', async ({ page }) => {
  // Session 0.
  await page.goto('/viewfinder?static=1&speed=8&session=0');
  await scanOnce(page);
  await newScan(page);
  await scanOnce(page);
  await newScan(page);
  await page.waitForTimeout(1500);
  const s0 = await calls(page);
  expect(s0).not.toContain('interstitialShow');
  expect(s0).toEqual([]);

  // Session 1: a new page load, the same storage.
  await page.goto('/viewfinder?static=1&speed=8&session=1');
  await expect(page.getByTestId('screen-viewfinder').last()).toBeVisible();
  await scanOnce(page);
  const tap1 = await newScan(page);
  await scanOnce(page);
  const tap2 = await newScan(page);
  await page.waitForTimeout(1500);
  const all = await log(page);
  const s1 = all.map((e) => e.call).filter((c) => /^interstitial/.test(c));
  console.log('__adsLog session 0:', JSON.stringify(s0));
  console.log('__adsLog session 1:', JSON.stringify(s1));
  const shows = s1.filter((c) => c === 'interstitialShow');
  expect(shows.length).toBeLessThanOrEqual(1);
  expect(shows).toHaveLength(1);
  expect(s1.indexOf('interstitialLoad')).toBeGreaterThanOrEqual(0);
  expect(s1.indexOf('interstitialLoad')).toBeLessThan(s1.indexOf('interstitialShow'));
  // Two scans since the install's start were already logged, so the first return in session 1 is the
  // one that shows: at least 500 ms after that tap, and not after the second tap's.
  const show = all.find((e) => e.call === 'interstitialShow')!;
  expect(show.at - tap1).toBeGreaterThanOrEqual(500);
  expect(show.at).toBeLessThan(tap2);
  // The viewfinder was on screen when it showed.
  await expect(page.getByTestId('screen-viewfinder').last()).toBeVisible();
});

test('a first launch with no ?session starts at session 0: no load, no show, however many scans', async ({ page }) => {
  await page.goto('/viewfinder?static=1&speed=8');
  for (let i = 0; i < 3; i++) {
    await scanOnce(page);
    await newScan(page);
  }
  await page.waitForTimeout(1200);
  expect(await calls(page)).toEqual([]);
});

test('leaving a case reopened from the log never shows an interstitial, though the machine is otherwise ready', async ({ page }) => {
  await page.goto('/viewfinder?static=1&speed=8&session=0');
  await scanOnce(page);
  await newScan(page);
  await scanOnce(page);
  await newScan(page);
  // Session 1 opens on the saved case: two scans are on record and the ad is preloaded, but this
  // is not a result that came from a scan, so the tap back to the viewfinder shows nothing.
  await page.goto('/result/0001?static=1&session=1&fixture=cellar');
  await expect(page.getByTestId('screen-result').last()).toBeVisible();
  await expect.poll(() => calls(page)).toContain('interstitialLoad');
  await page.getByTestId('screen-result').last().getByTestId('key-back').click();
  await expect(page.getByTestId('screen-viewfinder').last()).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await calls(page)).not.toContain('interstitialShow');
});

test('with consent denied no interstitial is requested at all', async ({ page }) => {
  await page.goto('/viewfinder?static=1&speed=8&session=0&consent=denied');
  await scanOnce(page);
  await newScan(page);
  await scanOnce(page);
  await newScan(page);
  await page.goto('/viewfinder?static=1&speed=8&session=1&consent=denied');
  await scanOnce(page);
  await newScan(page);
  await page.waitForTimeout(1200);
  expect(await calls(page)).toEqual([]);
});
