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

const FORM = ['requestInfoUpdate', 'loadAndShowConsentFormIfRequired'];
const CHOICES = [...FORM, 'getUserChoices', 'setRequestConfiguration', 'initialize'];
// Each row pins the exact ads facade call list and the exact stored consent summary. Analytics runs
// only for notRequired, or obtained with Purpose 1 granted (src/ads/core.ts), so that column is the
// stored status plus purpose1 and canRequestAds, not a derived flag.
for (const [consent, extra, calls_, saved_] of [
  ['required', '', CHOICES, { status: 'obtained', canRequestAds: true, purpose1: true, privacyOptionsRequired: true }],
  ['required', '&purpose1=0', CHOICES, { status: 'obtained', canRequestAds: true, purpose1: false, privacyOptionsRequired: true }],
  ['obtained', '', CHOICES, { status: 'obtained', canRequestAds: true, purpose1: true, privacyOptionsRequired: true }],
  ['obtained', '&purpose1=1', CHOICES, { status: 'obtained', canRequestAds: true, purpose1: true, privacyOptionsRequired: true }],
  ['obtained', '&purpose1=0', CHOICES, { status: 'obtained', canRequestAds: true, purpose1: false, privacyOptionsRequired: true }],
  ['notRequired', '', [...FORM, 'setRequestConfiguration', 'initialize'], { status: 'notRequired', canRequestAds: true, purpose1: false, privacyOptionsRequired: false }],
  ['denied', '', FORM, { status: 'required', canRequestAds: false, purpose1: false, privacyOptionsRequired: true }],
  ['error', '', FORM, { status: 'error', canRequestAds: false, purpose1: false, privacyOptionsRequired: false }],
] as const) {
  test(`consent=${consent}${extra}: the ads facade call order`, async ({ page }) => {
    await page.goto(`/settings?static=1&consent=${consent}${extra}`);
    await expect(page.getByTestId('screen-settings')).toBeVisible();
    await expect.poll(async () => (await calls(page)).length).toBeGreaterThan(0);
    await page.waitForTimeout(200);
    expect(await calls(page)).toEqual(calls_);
    const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('fs4.consent.v1'))) ?? '{}');
    expect(saved).toEqual(saved_);
  });
}

test('the privacy policy and impressum are reachable within two taps of the viewfinder flow', async ({ page }) => {
  await page.goto('/history?static=1');
  await page.getByTestId('key-forward').click();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await page.getByTestId('setting-legal').click();
  await expect(page.getByTestId('legal-privacy-policy')).toBeVisible();
});

test('INTENSITY cycles CALM, STANDARD, BRAVE, persists, and Calm turns the scare circuit off', async ({ page }) => {
  await page.goto('/settings?static=1');
  const state = page.getByTestId('setting-intensity-state');
  await expect(page.getByText('INTENSITY', { exact: true })).toBeVisible();
  await expect(state).toHaveText('STANDARD');
  await page.getByTestId('setting-intensity').click();
  await expect(state).toHaveText('BRAVE');
  expect(await page.evaluate(() => localStorage.getItem('fs4.intensity.v1'))).toBe('brave');
  await page.getByTestId('setting-intensity').click();
  await expect(state).toHaveText('CALM');
  await expect(page.getByTestId('setting-jumpscares-state')).toHaveText('OFF');
  await page.reload();
  await expect(page.getByTestId('setting-intensity-state')).toHaveText('CALM');
  await page.getByTestId('setting-intensity').click();
  await expect(page.getByTestId('setting-intensity-state')).toHaveText('STANDARD');
});

test('the relay row reads FIELD LOG RELAY with one help line', async ({ page }) => {
  await page.goto('/settings?static=1');
  await expect(page.getByTestId('setting-relay')).toContainText('FIELD LOG RELAY');
  await expect(page.getByTestId('setting-relay-help')).toHaveText('Max 1 line a night. 18:00 to 22:00.');
});

test('LANGUAGE row cycles SYSTEM, EN, DE, ES, PT and keeps the choice', async ({ page }) => {
  await page.goto('/settings?static=1');
  const state = page.getByTestId('setting-language-state');
  await expect(state).toHaveText('SYSTEM');
  for (const next of ['EN', 'DE', 'ES', 'PT', 'SYSTEM', 'EN', 'DE']) {
    await page.getByTestId('setting-language').click();
    await expect(state).toHaveText(next);
  }
  await page.reload();
  await expect(page.getByTestId('setting-language-state')).toHaveText('DE');
  // No de.json yet: the screen stays in English and keeps working.
  await expect(page.getByTestId('settings-about')).toHaveText('READINGS ARE SIMULATED. FIELD INSTRUMENT FICTION.');
});

test('?lang=de with no de.json falls back to English without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/settings?static=1&lang=de');
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await expect(page.getByTestId('settings-about')).toHaveText('READINGS ARE SIMULATED. FIELD INSTRUMENT FICTION.');
  await expect(page.getByTestId('setting-sound')).toContainText('SOUND');
  expect(errors).toEqual([]);
});
