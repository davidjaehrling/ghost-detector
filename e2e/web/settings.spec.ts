import { expect, test } from '@playwright/test';

type AdsEntry = { t: number; call: string; args: unknown[] };
const adsLog = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __adsLog?: AdsEntry[] }).__adsLog ?? []);
const calls = async (page: import('@playwright/test').Page) => (await adsLog(page)).map((e) => e.call);

test('PRIVACY row shows only when privacy options are required', async ({ page }) => {
  await page.goto('/settings?static=1');
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await expect(page.getByTestId('setting-legal')).toBeVisible();
  await expect(page.getByTestId('setting-privacy')).toHaveCount(0);

  await page.goto('/settings?static=1&privacyOptions=1');
  await expect(page.getByTestId('setting-privacy')).toBeVisible();
  await page.getByTestId('setting-privacy').click();
  await expect.poll(() => calls(page)).toContain('showPrivacyOptionsForm');
});

test('Settings states that readings are simulated', async ({ page }) => {
  await page.goto('/settings?static=1');
  await expect(page.getByTestId('settings-about')).toHaveText('READINGS ARE SIMULATED. FIELD INSTRUMENT FICTION.');
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('settings.png', { maxDiffPixels: 150 });
});

test('LEGAL opens the list in one tap, both pages open in the system browser', async ({ page }) => {
  await page.goto('/settings?static=1');
  await page.getByTestId('setting-legal').click();
  await expect(page.getByTestId('screen-legal')).toBeVisible();
  await expect(page.getByTestId('legal-impressum')).toBeVisible();
  await expect(page.getByTestId('legal-privacy-policy')).toBeVisible();
  await expect(page.getByTestId('legal-about')).toContainText('SIMULATED');
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('legal.png', { maxDiffPixels: 150 });

  // On web expo-linking navigates the page; native opens the system browser. The URLs are the
  // placeholders from src/ui/legal.ts.
  await page.route('https://example.invalid/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>ok</title>' }));
  for (const [id, path] of [['legal-impressum', '/impressum'], ['legal-privacy-policy', '/privacy']] as const) {
    await page.goto('/legal?static=1');
    await page.getByTestId(id).click();
    await page.waitForURL(`https://example.invalid${path}`);
  }
});

for (const [consent, extra, expected, ads, analytics] of [
  ['required', '', ['requestInfoUpdate', 'loadAndShowConsentFormIfRequired', 'getUserChoices', 'setRequestConfiguration', 'initialize'], true, true],
  ['required', '&purpose1=0', ['requestInfoUpdate', 'loadAndShowConsentFormIfRequired', 'getUserChoices', 'setRequestConfiguration', 'initialize'], true, false],
  ['notRequired', '', ['requestInfoUpdate', 'loadAndShowConsentFormIfRequired', 'setRequestConfiguration', 'initialize'], true, true],
  ['denied', '', ['requestInfoUpdate', 'loadAndShowConsentFormIfRequired'], false, false],
  ['error', '', ['requestInfoUpdate', 'loadAndShowConsentFormIfRequired'], false, false],
] as const) {
  test(`consent=${consent}${extra}: the ads facade call order`, async ({ page }) => {
    await page.goto(`/settings?static=1&consent=${consent}${extra}`);
    await expect(page.getByTestId('screen-settings')).toBeVisible();
    await expect.poll(async () => (await calls(page)).length).toBeGreaterThan(0);
    await page.waitForTimeout(200);
    expect(await calls(page)).toEqual(expected);
    const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('fs4.consent.v1'))) ?? '{}') as { canRequestAds: boolean; purpose1: boolean };
    expect(saved.canRequestAds).toBe(ads);
    expect(saved.purpose1 && ads).toBe(analytics && consent === 'required');
  });
}

test('the privacy policy and impressum are reachable within two taps of the viewfinder flow', async ({ page }) => {
  await page.goto('/history?static=1');
  await page.getByTestId('key-forward').click();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await page.getByTestId('setting-legal').click();
  await expect(page.getByTestId('legal-privacy-policy')).toBeVisible();
});
