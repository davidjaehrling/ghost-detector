import { expect, test, type Page } from '@playwright/test';

// P6-05 part 1. The FIELD LOG RELAY opt-in on the viewfinder and the Settings RELAY row.
// The log demo seeds six cases (session=1 lifts the first-session rule), so the first return from a
// result is eligible. The web stub records every call in window.__notifyLog.

const BODY = 'Fit the relay? At most one field-log line a night. Index, moon, an open case or the catalogue. 18:00 to 22:00. No sound. Lines are simulated.';

// `getPermission` is the silent re-read of the stored permission on app open; it never asks. The
// opt-in assertions are about what is asked and created, so it is left out of the list.
const calls = (page: Page) => page.evaluate(() => (window.__notifyLog ?? []).map((e) => e.call).filter((c) => c !== 'getPermission'));

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
  // The body prints one sentence per line; the text content is the whole body, in order.
  expect(((await page.getByTestId('relay-body').textContent()) ?? '').replace(/\s+/g, ' ').trim()).toBe(BODY);
  // The catalogue is named (A-82).
  await expect(page.getByTestId('relay-body')).toContainText('the catalogue');
  // Screen text, not a dialog (A-80): no keyline box, no radius, a p1 top rule, inside the glass and above the keys.
  const glass = (await page.getByTestId('screen-viewfinder').last().getByTestId('screen-viewfinder-glass').boundingBox())!;
  const mbox = (await mod.boundingBox())!;
  expect(mbox.x).toBeGreaterThanOrEqual(glass.x - 0.5);
  expect(mbox.x + mbox.width).toBeLessThanOrEqual(glass.x + glass.width + 0.5);
  expect(mbox.y + mbox.height).toBeLessThanOrEqual(glass.y + glass.height);
  const frame = await mod.evaluate((e) => {
    const cs = getComputedStyle(e);
    return { top: cs.borderTopWidth, topColor: cs.borderTopColor, left: cs.borderLeftWidth, right: cs.borderRightWidth, bottom: cs.borderBottomWidth, radius: cs.borderTopLeftRadius, anim: cs.animationName, transform: cs.transform };
  });
  expect(frame).toMatchObject({ top: '1px', topColor: 'rgb(28, 74, 42)', left: '0px', right: '0px', bottom: '0px', radius: '0px', anim: 'none', transform: 'none' });
  // The simulated sentence is p4 (124, 232, 149); the other sentences p3 (79, 180, 106).
  const colours = await page.getByTestId('relay-body').evaluate((e) => Array.from(e.children).map((c) => getComputedStyle(c).color));
  expect(colours.at(-1)).toBe('rgb(124, 232, 149)');
  expect(new Set(colours.slice(0, -1))).toEqual(new Set(['rgb(79, 180, 106)']));
  // Nothing has been requested yet: the dialog follows the tap.
  expect(await calls(page)).toEqual([]);
  // The keys sit on the hardware row, slots 1 and 2 (CAPTURE keeps slot 4), inside the key band and outside the module.
  await expect(mod.getByTestId('relay-fit')).toHaveCount(0);
  await expect(mod.getByTestId('relay-notnow')).toHaveCount(0);
  const slots = await Promise.all(['relay-fit', 'relay-notnow'].map((id) => page.getByTestId(id).boundingBox()));
  const modBox = (await mod.boundingBox())!;
  expect(slots[0]!.y).toBeGreaterThan(modBox.y + modBox.height);
  expect(slots[0]!.x).toBeLessThan(slots[1]!.x);
  expect(Math.round(slots[0]!.y)).toBe(Math.round(slots[1]!.y));
  expect(await page.getByTestId('key-dummy').count()).toBeGreaterThanOrEqual(2);
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
  // CAPTURE stays live in its usual slot (last, right of the relay keys, same row).
  const cap = (await page.getByTestId('key-capture').boundingBox())!;
  expect(cap.x).toBeGreaterThan(slots[1]!.x);
  expect(Math.round(cap.y)).toBe(Math.round(slots[0]!.y));
  await expect(page.getByTestId('key-capture')).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('relay-module.png', { maxDiffPixels: 150 });
  // Nothing was scheduled or asked while the offer was up (only FIT RELAY schedules).
  expect(await calls(page)).toEqual([]);

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

test('at 428 the module sits inside the glass, clear of the keys, and no sentence is clipped', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-428x926', '428 check');
  await start(page, '&notify=granted');
  await backFromACase(page);
  const mod = page.getByTestId('relay-module');
  await expect(mod).toBeVisible();
  await page.waitForTimeout(300);
  const glass = (await page.getByTestId('screen-viewfinder').last().getByTestId('screen-viewfinder-glass').boundingBox())!;
  const m = (await mod.boundingBox())!;
  const fit = (await page.getByTestId('relay-fit').boundingBox())!;
  const not = (await page.getByTestId('relay-notnow').boundingBox())!;
  expect(m.x).toBeGreaterThanOrEqual(glass.x);
  expect(m.x + m.width).toBeLessThanOrEqual(glass.x + glass.width + 0.5);
  expect(m.y + m.height).toBeLessThan(Math.min(fit.y, not.y));
  const clipped = await page.getByTestId('relay-body').evaluate((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1);
  expect(clipped).toBe(false);
  expect(Math.round(fit.width)).toBe(Math.round(not.width));
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

test('CAPTURE during the module counts as NOT NOW: no request, offered stays true, module never returns', async ({ page }) => {
  await start(page, '&notify=granted');
  await backFromACase(page);
  await expect(page.getByTestId('relay-module')).toBeVisible();
  await page.getByTestId('key-capture').click();
  await expect(page.getByTestId('relay-module')).toHaveCount(0);
  expect(await calls(page)).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fs4.relay.v1') ?? 'null'))).toMatchObject({ offered: true, enabled: false });
  await page.goto('/history?static=1&log=demo3&session=1&notify=granted');
  await backFromACase(page);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('relay-module')).toHaveCount(0);
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

// P6-05 part 2. Scheduling: the engine's lines land in window.__notifyLog (schedule and cancel entries).
// ?relay=on fits the relay at load; ?clock=<iso> fixes the scheduler's now; the demo log seeds the cases.

type Entry = { call: string; id?: string; templateId?: number; fireAtMs?: number; title?: string; body?: string };
const log = (page: Page) => page.evaluate(() => (window.__notifyLog ?? []) as Entry[]);
const sched = async (page: Page) => (await log(page)).filter((e) => e.call === 'schedule');
const NOON = '2026-10-13T12:00:00';
const fit = (clock: string, notify = 'granted') => `&notify=${notify}&relay=on&clock=${encodeURIComponent(clock)}`;

const localParts = (page: Page, ms: number) =>
  page.evaluate((t) => {
    const d = new Date(t);
    return { day: d.getDate(), minutes: d.getHours() * 60 + d.getMinutes() };
  }, ms);

test('relay on: a field-log line is scheduled inside 18:00 to 22:00 local, titled FIELD LOG', async ({ page }) => {
  await start(page, fit(NOON));
  await backFromACase(page);
  await expect.poll(async () => (await sched(page)).length).toBeGreaterThan(0);
  const lines = await sched(page);
  const now = await page.evaluate((c) => new Date(c).getTime(), NOON);
  for (const l of lines) {
    expect(l.title!.startsWith('FIELD LOG')).toBe(true);
    expect(l.fireAtMs!).toBeGreaterThan(now);
    expect(l.fireAtMs! - now).toBeLessThan(7 * 86_400_000);
    const p = await localParts(page, l.fireAtMs!);
    expect(p.minutes).toBeGreaterThanOrEqual(18 * 60);
    expect(p.minutes).toBeLessThan(22 * 60);
  }
  // No second pass reschedules the same lines.
  await page.getByTestId('key-log').last().click();
  await backFromACase(page);
  await page.waitForTimeout(300);
  expect((await sched(page)).length).toBe(lines.length);
});

test('relay on late at night: the first line waits for the next window', async ({ page }) => {
  await start(page, fit('2026-10-13T23:30:00'));
  await backFromACase(page);
  await expect.poll(async () => (await sched(page)).length).toBeGreaterThan(0);
  for (const l of await sched(page)) {
    const p = await localParts(page, l.fireAtMs!);
    expect(p.day).toBeGreaterThanOrEqual(14);
    expect(p.minutes).toBeGreaterThanOrEqual(18 * 60);
    expect(p.minutes).toBeLessThan(22 * 60);
  }
});

// Calm sends the full-moon and catalogue lines only, so this night sits in the full-moon window.
const FULL_MOON = '2026-10-25T12:00:00';

test('switching to CALM cancels the pending lines, then schedules the full-moon line again', async ({ page }) => {
  await start(page, fit(FULL_MOON));
  await backFromACase(page);
  await expect.poll(async () => (await sched(page)).length).toBeGreaterThan(0);
  // Calm through the real control: STANDARD, BRAVE, CALM on the INTENSITY row.
  await toSettings(page);
  await expect(page.getByTestId('setting-intensity-state')).toHaveText('STANDARD');
  await page.getByTestId('setting-intensity').click();
  await expect(page.getByTestId('setting-intensity-state')).toHaveText('BRAVE');
  await page.waitForTimeout(500);
  // The lines pending now: scheduled and not cancelled since.
  const before = await log(page);
  const live = new Set<string>();
  for (const e of before) {
    if (e.call === 'schedule') live.add(e.id!);
    if (e.call === 'cancel') live.delete(e.id!);
  }
  expect(live.size).toBeGreaterThan(0);
  await page.getByTestId('setting-intensity').click();
  await expect(page.getByTestId('setting-intensity-state')).toHaveText('CALM');
  await expect.poll(async () => (await log(page)).slice(before.length).some((e) => e.call === 'schedule')).toBe(true);
  const after = (await log(page)).slice(before.length);
  const calls = after.map((e) => e.call);
  expect(after.filter((e) => e.call === 'cancel').map((e) => e.id).sort()).toEqual([...live].sort());
  expect(calls.indexOf('cancel')).toBe(0);
  expect(calls).toContain('schedule');
  expect(calls.indexOf('schedule')).toBeGreaterThan(calls.lastIndexOf('cancel'));
});

test('RELAY off in Settings cancels every pending line', async ({ page }) => {
  await start(page, fit(NOON));
  await backFromACase(page);
  await expect.poll(async () => (await sched(page)).length).toBeGreaterThan(0);
  const ids = (await sched(page)).map((e) => e.id).sort();
  await toSettings(page);
  await expect(page.getByTestId('setting-relay-state')).toHaveText('ON');
  await page.getByTestId('setting-relay').click();
  await expect(page.getByTestId('setting-relay-state')).toHaveText('OFF');
  await expect.poll(async () => (await log(page)).filter((e) => e.call === 'cancel').map((e) => e.id).sort()).toEqual(ids);
});

test('a system denial schedules nothing', async ({ page }) => {
  await start(page, fit(NOON, 'denied'));
  await backFromACase(page);
  await page.waitForTimeout(500);
  expect((await log(page)).filter((e) => e.call === 'schedule' || e.call === 'cancel')).toEqual([]);
});

// A-80: the offer prints line by line at telemetry speed (under ?static=1 it is whole at once, so this walk
// is not static: three stored cases, a real return from a result).
test('the offer prints one line at a time and ends whole', async ({ page }) => {
  const rec = (id: string, spi: number, tier: string) => ({
    id, createdAt: Date.now() - 1000 * Number(id), tag: 'hall', seed: 95 + Number(id),
    photoUri: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    outcome: { tier, spi, figureShown: false, smudge: false, jumpScare: false, scanDurationMs: 7000 },
    profile: { class: 'KEEPER', era: 'Era est. 1905 to 1973', name: 'RSD-9', traits: [], signatureDecodedPct: 61 },
  });
  await page.addInitScript((r) => localStorage.setItem('fs4.scans.v1', JSON.stringify(r)), [rec('0003', 62, 'active'), rec('0002', 55, 'active'), rec('0001', 50, 'active')]);
  await page.goto('/result/0001?session=1&notify=granted');
  await expect(page.getByTestId('result-spi')).toHaveText('50', { timeout: 10_000 });
  await page.waitForTimeout(600);
  await page.getByTestId('key-back').click();
  await expect(page.getByTestId('relay-module')).toBeVisible();
  const printed = () => page.getByTestId('relay-body').evaluate((e) => Array.from(e.children).filter((c) => getComputedStyle(c).opacity === '1').length);
  const seen: number[] = [];
  for (let i = 0; i < 14; i++) {
    seen.push(await printed());
    await page.waitForTimeout(120);
  }
  const total = await page.getByTestId('relay-body').evaluate((e) => e.children.length);
  // Monotonic, starting short of the whole body and ending with every sentence printed.
  expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  expect(seen[0]).toBeLessThan(total);
  expect(seen.at(-1)).toBe(total);
  expect(new Set(seen).size).toBeGreaterThan(1);
});

// D-045 6: nothing is scheduled without FIT RELAY, whichever way the offer is left.
test('leaving the offer by CAPTURE or NOT NOW schedules nothing; only FIT RELAY does', async ({ page }) => {
  await start(page, `&notify=granted&clock=${encodeURIComponent('2026-10-13T12:00:00')}`);
  await backFromACase(page);
  await page.getByTestId('relay-notnow').click();
  await page.waitForTimeout(500);
  expect((await page.evaluate(() => (window.__notifyLog ?? []).filter((e) => e.call === 'schedule' || e.call === 'requestPermission'))).length).toBe(0);
});
