import { expect, test, type Page } from '@playwright/test';

// P4-04: the screens call the sound facade (src/ui/audio.ts). On web the engine and haptics are
// no-ops that record their calls: window.__audioLog (the engine), window.__hapticLog and
// window.__cueLog (the facade's own ordered list, which also carries the scan-start haptic).
// Native audio cannot run here; the cue order is what L2 proves.
const SEED = 20261013;
const PHASES = ['scanPhase 0', 'scanPhase 1', 'scanPhase 2', 'scanPhase 3', 'scanPhase 4'];
const ENGINE_CUES = /^(start|stop|scanPhase \d|hold|reveal|fault|scare|setTier|setFlux)$/;

const cues = (page: Page) => page.evaluate(() => (window as unknown as { __cueLog?: string[] }).__cueLog ?? []);
const engineCalls = (page: Page) =>
  page.evaluate(() => ((window as unknown as { __audioLog?: () => { call: string; args: unknown[] }[] }).__audioLog?.() ?? []).map((e) => (e.call === 'scanPhase' ? `scanPhase ${e.args[0]}` : e.call)));
const hapticEvents = (page: Page) =>
  page.evaluate(() => ((window as unknown as { __hapticLog?: () => { event: string; args: unknown[] }[] }).__hapticLog?.() ?? []).filter((e) => e.event === 'fire').map((e) => String(e.args[0])));

// A fault beat adds one cue; the order test is about the rest.
const noFault = (list: string[]) => list.filter((c) => c !== 'fault');

test('a real scan plays start, scanStart, phases 0 to 4, hold, reveal in that order', async ({ page }) => {
  await page.goto(`/scan?static=1&speed=8&seed=${SEED}`);
  await expect(page.getByTestId('screen-result')).toBeVisible({ timeout: 15_000 });
  const order = noFault((await cues(page)).filter((c) => /^(start|scanStart|scanPhase \d|hold|reveal|fault)$/.test(c)));
  expect(order).toEqual(['start', 'scanStart', ...PHASES, 'hold', 'reveal']);
  // The engine itself saw the same cues, and the haptics the scan start and the scan end.
  expect(noFault((await engineCalls(page)).filter((c) => ENGINE_CUES.test(c) && c !== 'setTier'))).toEqual(['start', ...PHASES, 'hold', 'reveal']);
  const haptics = await hapticEvents(page);
  expect(haptics).toContain('scanStart');
  expect(haptics.some((h) => h === 'scanEnd' || h === 'criticalResult')).toBe(true);
});

test('the fault beat reaches the engine once, between the phases and the hold', async ({ page }) => {
  await page.goto('/scan?static=1&phase=fault&seed=41');
  await expect(page.getByTestId('screen-scan')).toBeVisible();
  await expect.poll(() => cues(page)).toContain('fault');
  const list = await cues(page);
  expect(list.filter((c) => c === 'fault')).toHaveLength(1);
  expect(list.indexOf('fault')).toBeGreaterThan(list.indexOf('scanPhase 0'));
  expect(list).not.toContain('hold');
});

test('boot is silent; the viewfinder starts the scene once and capture taps', async ({ page }) => {
  await page.goto('/?static=1&date=2026-10-13');
  await expect(page.getByTestId('boot-screen')).toBeVisible();
  await page.waitForTimeout(500);
  expect(await cues(page)).toEqual([]);
  expect(await engineCalls(page)).toEqual([]);

  await page.goto('/viewfinder?static=1');
  await expect(page.getByTestId('key-capture')).toBeVisible();
  await expect.poll(() => engineCalls(page)).toContain('start');
  expect((await engineCalls(page)).filter((c) => c === 'start')).toHaveLength(1);
  await expect.poll(async () => (await engineCalls(page)).includes('setFlux')).toBe(true);
  await page.getByTestId('key-capture').click();
  await expect(page.getByTestId('screen-scan')).toBeVisible();
  expect(await hapticEvents(page)).toContain('capture');
});

test('Settings: SOUND off keeps the engine silent through a whole scan', async ({ page }) => {
  await page.goto('/settings?static=1');
  await expect(page.getByTestId('setting-sound-state')).toHaveText('ON');
  await page.getByTestId('setting-sound').click();
  await expect(page.getByTestId('setting-sound-state')).toHaveText('OFF');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('fs4.settings.v1'))) ?? '{}')).toMatchObject({ sound: false });

  await page.goto(`/scan?static=1&speed=8&seed=${SEED}`);
  await expect(page.getByTestId('screen-result')).toBeVisible({ timeout: 15_000 });
  expect(await engineCalls(page)).toEqual([]);
  const list = await cues(page);
  expect(list.filter((c) => ENGINE_CUES.test(c))).toEqual([]);
  // Haptics are a separate switch and still tap.
  expect(await hapticEvents(page)).toContain('scanStart');
});

test('Settings: HAPTICS off sends no tap', async ({ page }) => {
  await page.goto('/settings?static=1');
  await page.getByTestId('setting-haptics').click();
  await expect(page.getByTestId('setting-haptics-state')).toHaveText('OFF');
  await page.goto(`/scan?static=1&speed=8&seed=${SEED}`);
  await expect(page.getByTestId('screen-result')).toBeVisible({ timeout: 15_000 });
  expect(await hapticEvents(page)).not.toContain('scanStart');
  expect(await cues(page)).toContain('start');
});

test('Settings: jump scares are on for Standard, and locked off on Calm with the instrument line', async ({ page }) => {
  await page.goto('/settings?static=1');
  await expect(page.getByTestId('setting-jumpscares-state')).toHaveText('ON');
  await page.getByTestId('setting-jumpscares').click();
  await expect(page.getByTestId('setting-jumpscares-state')).toHaveText('OFF');
  await page.getByTestId('setting-jumpscares').click();
  await expect(page.getByTestId('setting-jumpscares-state')).toHaveText('ON');
  await expect(page.getByTestId('settings-calm-note')).toHaveCount(0);

  await page.evaluate(() => localStorage.setItem('fs4.intensity.v1', 'calm'));
  await page.goto('/settings?static=1');
  await expect(page.getByTestId('setting-jumpscares-state')).toHaveText('OFF');
  await page.getByTestId('setting-jumpscares').click();
  await expect(page.getByTestId('setting-jumpscares-state')).toHaveText('OFF');
  await expect(page.getByTestId('settings-calm-note')).toHaveText('CALM MODE. SCARE CIRCUIT DISABLED.');
});
