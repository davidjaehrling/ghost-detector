import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

// A-70: the unit's plate data fills the lower glass: model, serial, firmware, CAL, DUE, PRÜF. The same
// serial as the nameplate, and the ABOUT line stays above it.
test('the UNIT block prints the plate data under the ABOUT line', async ({ page }) => {
  await page.goto('/settings?static=1');
  const unit = page.getByTestId('settings-unit');
  await expect(unit).toBeVisible();
  const text = (await unit.innerText()).replace(/\s+/g, ' ');
  expect(text).toContain('VELDEN FS-4/87-P');
  expect(text).toContain('FS4-8711-00417-9');
  expect(text).toContain('FW 3.1.7 · ROM C2-8811');
  expect(text).toContain('CAL 2026-10-13');
  expect(text).toContain('DUE 2027-10');
  expect(text).toMatch(/PRÜF 07/);
  const about = (await page.getByTestId('settings-about').boundingBox())!;
  const box = (await unit.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(about.y + about.height);
});

// A-70 / D-045: the ABOUT simulated line is visible without scrolling at 360 and at font scale 1.3. Web has no
// system font scale, so every text node is scaled by 1.3 after load (size and line height), the same
// growth Android applies. A line is "visible" when its whole box is inside the list viewport.
for (const lang of ['en', 'de']) {
  test(`ABOUT is visible without scrolling at font scale 1.3 (${lang})`, async ({ page }) => {
    await page.goto(`/settings?static=1&lang=${lang}`);
    await expect(page.getByTestId('settings-about')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      for (const e of Array.from(document.querySelectorAll('[data-testid="screen-settings"] *')) as HTMLElement[]) {
        if (!Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent?.trim())) continue;
        const c = getComputedStyle(e);
        e.style.fontSize = `${parseFloat(c.fontSize) * 1.3}px`;
        if (c.lineHeight !== 'normal') e.style.lineHeight = `${parseFloat(c.lineHeight) * 1.3}px`;
        e.style.height = 'auto';
      }
    });
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => {
      const list = document.querySelector('[data-testid="settings-list"]')!.getBoundingClientRect();
      const about = document.querySelector('[data-testid="settings-about"]')!.getBoundingClientRect();
      return { listTop: list.top, listBottom: list.bottom, top: about.top, bottom: about.bottom, vw: window.innerWidth };
    });
    console.log(`ABOUT at scale 1.3, width ${m.vw}: box ${m.top.toFixed(1)}-${m.bottom.toFixed(1)}, list ${m.listTop.toFixed(1)}-${m.listBottom.toFixed(1)}`);
    expect(m.top).toBeGreaterThanOrEqual(m.listTop);
    expect(m.bottom).toBeLessThanOrEqual(m.listBottom);
  });
}

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

const locale = (lang: string) => JSON.parse(readFileSync(join(__dirname, '..', '..', 'locales', `${lang}.json`), 'utf8')) as Record<string, string>;

test('LANGUAGE row cycles SYSTEM, EN, DE, ES, PT and keeps the choice', async ({ page }) => {
  await page.goto('/settings?static=1');
  const state = page.getByTestId('setting-language-state');
  await expect(state).toHaveText('SYSTEM');
  // The row prints its value in the language that is active once the tap lands.
  let lang = 'en';
  for (const next of ['en', 'de', 'es', 'pt', 'system', 'en', 'de']) {
    await page.getByTestId('setting-language').click();
    lang = next === 'system' ? 'en' : next;
    await expect(state).toHaveText(locale(lang)[`settings.language.${next}`]!);
    await expect(page.getByTestId('settings-about')).toHaveText(locale(lang)['about.line']!);
  }
  await page.reload();
  await expect(page.getByTestId('setting-language-state')).toHaveText(locale('de')['settings.language.de']!);
  await expect(page.getByTestId('settings-about')).toHaveText(locale('de')['about.line']!);
  await expect(page.getByTestId('setting-sound')).toContainText(locale('de')['settings.sound']!);
});

test('?lang=xx, a language with no file, falls back to English without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/settings?static=1&lang=xx');
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await expect(page.getByTestId('settings-about')).toHaveText('READINGS ARE SIMULATED. FIELD INSTRUMENT FICTION.');
  await expect(page.getByTestId('setting-sound')).toContainText('SOUND');
  expect(errors).toEqual([]);
});
