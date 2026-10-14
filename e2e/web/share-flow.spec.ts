import { expect, test, type Page } from '@playwright/test';
import { waitWarped } from './warped';

// P6-02. The share flow on the result screen. ?static=1 freezes the proactive timers unless the page
// asks for share=timer; share=offer|updated|format|fail put the screen in a state for the goldens.
// The web stub records every share in window.__shareLog instead of opening a sheet.

const ACTIVE = '/result/demo?static=1&fixture=cellar&demo=active'; // case 0007
const STRONG = '/result/demo?static=1&fixture=cellar&demo=strong'; // case 0003
const TRACE = '/result/demo?static=1&fixture=cellar&demo=quiet&seed=6'; // TRACE 20

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

const offerAt = (page: Page, text: string | RegExp) => expect(page.getByTestId('result-line')).toHaveText(text);
const shareLog = (page: Page) => page.evaluate(() => (window.__shareLog ?? []).map((e) => ({ format: e.format, fileName: e.fileName, uri: e.uri, title: e.title })));

const dims = (page: Page, uri: string) =>
  page.evaluate(
    (u) =>
      new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => reject(new Error('card did not decode'));
        img.src = u;
      }),
    uri,
  );

test('TRACE: the key works and no proactive line comes', async ({ page }) => {
  test.setTimeout(60_000);
  const check = watch(page);
  await page.goto(`${TRACE}&share=timer`);
  await expect(page.getByTestId('result-tier')).toHaveText('TRACE');
  await expect(page.getByTestId('key-share')).toBeVisible();
  await expect(page.getByTestId('key-share')).toHaveAccessibleName('Share result');
  await page.waitForTimeout(4500);
  await offerAt(page, 'Trace only. Below threshold for class.');
  await expect(page.getByText(/Field card/)).toHaveCount(0);
  await page.getByTestId('key-share').click();
  await expect(page.getByTestId('share-line')).toHaveText('Print field card. Format?');
  await expect(page.getByTestId('share-916')).toContainText('9:16');
  await expect(page.getByTestId('share-11')).toContainText('1:1');
  await expect(page.getByTestId('key-back')).toContainText('CANCEL');
  check();
});

test('ACTIVE: the line comes 3.0 s after the reveal settles, once, and goes after its life', async ({ page }) => {
  test.setTimeout(60_000);
  const check = watch(page);
  // In-page clock: when the result glass first mounts and when the card line first appears.
  await page.addInitScript(() => {
    const w = window as unknown as { __t: { mount?: number; offer?: number; offers: number } };
    w.__t = { offers: 0 };
    let on = false;
    new MutationObserver(() => {
      const now = performance.now();
      if (w.__t.mount === undefined && document.querySelector('[data-testid="result-tier"]')) w.__t.mount = now;
      const shown = (document.querySelector('[data-testid="result-line"]')?.textContent ?? '').startsWith('Field card');
      if (shown && !on) {
        w.__t.offer ??= now;
        w.__t.offers += 1;
      }
      on = shown;
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await page.goto(`${ACTIVE}&share=timer`);
  await expect(page.getByTestId('result-tier')).toHaveText('ACTIVE');
  await offerAt(page, 'Field card ready. SHARE prints it.');
  const t = await page.evaluate(() => (window as unknown as { __t: { mount: number; offer: number } }).__t);
  // 3.0 s after the settle (exact in the unit test); the settle is the mount plus the font load, and
  // the observer reports a mount late, so the window here is loose.
  expect(t.offer - t.mount).toBeGreaterThan(2500);
  expect(t.offer - t.mount).toBeLessThan(3800);
  await expect(page.getByTestId('key-share')).toBeEnabled();
  // Once per result: it goes after its life and does not come back.
  await expect(page.getByTestId('result-line')).toHaveText('Activity logged.', { timeout: 10_000 });
  await page.waitForTimeout(4000);
  await offerAt(page, 'Activity logged.');
  expect((await page.evaluate(() => (window as unknown as { __t: { offers: number } }).__t.offers))).toBe(1);
  check();
});

// In-page event log (performance.now): every change of the result line, the first appearance of the
// Deep Scan done line, and every press of the DEEP SCAN key. Playwright's own polling is too slow and
// too uneven under load to time a 3.0 s rule.
type Ev = { t: number; text: string };
type Log = { lines: Ev[]; done: number | null; presses: number[] };

async function logLines(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __log: { lines: { t: number; text: string }[]; done: number | null; presses: number[] } };
    w.__log = { lines: [], done: null, presses: [] };
    let last = '';
    new MutationObserver(() => {
      const now = performance.now();
      const text = document.querySelector('[data-testid="result-line"]')?.textContent ?? '';
      if (text !== last) {
        last = text;
        w.__log.lines.push({ t: now, text });
      }
      if (w.__log.done === null && document.querySelector('[data-testid="deepscan-done"]')) w.__log.done = now;
    }).observe(document, { childList: true, subtree: true, characterData: true });
    document.addEventListener('click', (e) => {
      if ((e.target as Element | null)?.closest('[data-testid="deepscan-key"]')) w.__log.presses.push(performance.now());
    }, true);
  });
}
const readLog = (page: Page) => page.evaluate(() => (window as unknown as { __log: Log }).__log);

test('no proactive line while a rewarded ad plays, nor within 3 s after it closes', async ({ page }) => {
  test.setTimeout(60_000);
  const check = watch(page);
  await logLines(page);
  // The offer line comes 3.0 s after the settle and takes key 4 dark, so under load a press from Playwright
  // can land after it. The page presses the key itself the moment it is live: one press to arm it (after the
  // 500 ms guard), a second to run the ad.
  await page.addInitScript(() => {
    const press = new MutationObserver(() => {
      const key = document.querySelector('[data-testid="deepscan-key"]') as HTMLElement | null;
      // Live once the legend leaves the engraved n4 (rgb 74, 77, 66).
      if (key && getComputedStyle(key.querySelector('div') as HTMLElement).color !== 'rgb(74, 77, 66)') {
        press.disconnect();
        setTimeout(() => key.click(), 600);
        setTimeout(() => key.click(), 800);
      }
    });
    press.observe(document, { childList: true, subtree: true, attributes: true });
  });
  await page.goto(`${STRONG}&share=timer&adReady=1&reward=0`);
  // The line was due about 3.0 s after the settle; the ad closed right after the press, so it waits.
  await expect(page.getByTestId('result-line')).toHaveText('Field card ready. SHARE prints it.', { timeout: 15_000 });
  const log = await readLog(page);
  const press = log.presses[1]!;
  // A line that was up just before the press is taken off by the ad; the one that follows is the one counted.
  const offers = log.lines.filter((l) => l.text.startsWith('Field card') && l.t > press);
  expect(offers).toHaveLength(1);
  // The press closes the ad within a frame or two (static): the line is at least 3.0 s clear of it.
  expect(offers[0]!.t - press).toBeGreaterThanOrEqual(3000);
  check();
});

test('after a Deep Scan the card line comes back once as updated', async ({ page }) => {
  test.setTimeout(60_000);
  const check = watch(page);
  await logLines(page);
  // The offer line comes 3.0 s after the settle and takes key 4 dark, so under load a press from Playwright
  // can land after it (a share moment hides the arm line). The page presses the key itself the moment it is
  // live: one press to arm it (after the 500 ms guard), a second to run the ad, and it notes whether the
  // armed sentence was on the glass at the second press.
  await page.addInitScript(() => {
    const w = window as unknown as { __armSeen?: boolean };
    const press = new MutationObserver(() => {
      const key = document.querySelector('[data-testid="deepscan-key"]') as HTMLElement | null;
      // Live once the legend leaves the engraved n4 (rgb 74, 77, 66).
      if (key && getComputedStyle(key.querySelector('div') as HTMLElement).color !== 'rgb(74, 77, 66)') {
        press.disconnect();
        setTimeout(() => key.click(), 600);
        setTimeout(() => {
          w.__armSeen = document.querySelector('[data-testid="deepscan-line"]') !== null;
          key.click();
        }, 800);
      }
    });
    press.observe(document, { childList: true, subtree: true, attributes: true });
  });
  await page.goto(`${STRONG}&share=timer`);
  await expect(page.getByTestId('deepscan-key')).toBeVisible();
  // Two presses: arm, then run.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __armSeen?: boolean }).__armSeen)).toBe(true);
  await expect(page.getByTestId('deepscan-done')).toBeVisible();
  await expect(page.getByTestId('result-line')).toHaveText('Field card updated. Class and EVP added.', { timeout: 15_000 });
  const log = await readLog(page);
  const updated = log.lines.filter((l) => l.text === 'Field card updated. Class and EVP added.');
  expect(updated).toHaveLength(1);
  // 3.0 s after the high-resolution figure has faded in, which is after the Deep Scan finished.
  expect(updated[0]!.t - log.done!).toBeGreaterThanOrEqual(3000);
  // After the press the plain line does not come: the Deep Scan came first, so the updated one is the line.
  expect(log.lines.filter((l) => l.text.startsWith('Field card ready') && l.t > log.presses[1]!)).toHaveLength(0);
  check();
});

test('9:16 and 1:1 land in __shareLog at the card sizes', async ({ page }) => {
  test.setTimeout(180_000);
  const check = watch(page);
  await page.goto(`${ACTIVE}&share=format`);
  await expect(page.getByTestId('share-panel')).toBeVisible();
  await expect(page.getByTestId('deepscan-key')).toHaveCount(0);
  await expect(page.getByTestId('deepscan-line')).toHaveCount(0);
  // The format is chosen on the hardware row: CANCEL, 9:16 STORY, 1:1 SQUARE, a dark cap. THERM is gone.
  await expect(page.getByTestId('key-back')).toHaveText('CANCEL');
  await expect(page.getByTestId('share-916')).toHaveText(/9:16\s*STORY/);
  await expect(page.getByTestId('share-11')).toHaveText(/1:1\s*SQUARE/);
  await expect(page.getByTestId('key-therm')).toHaveCount(0);
  await expect(page.getByTestId('key-share')).toHaveCount(0);
  const keyXs = await Promise.all(['key-back', 'share-916', 'share-11'].map(async (id) => Math.round((await page.getByTestId(id).boundingBox())!.x)));
  expect([...keyXs].sort((a, b) => a - b)).toEqual(keyXs);
  // The card renders in well under a second on web, so key 4 and the inert keys are sampled in the page
  // on every DOM change made while the printing line is up.
  await page.evaluate(() => {
    const w = window as unknown as { __deepWhilePrinting: number[]; __inertWhilePrinting: string[] };
    w.__deepWhilePrinting = [];
    w.__inertWhilePrinting = [];
    new MutationObserver(() => {
      if (document.querySelector('[data-testid=share-line]')?.textContent?.startsWith('PRINTING')) {
        w.__deepWhilePrinting.push(document.querySelectorAll('[data-testid=deepscan-key]').length);
        for (const id of ['key-back', 'key-share', 'key-therm']) {
          const el = document.querySelector(`[data-testid=${id}]`);
          // Inert is the engraved n4 legend (rgb 74, 77, 66); a live key is lighter.
          w.__inertWhilePrinting.push(`${id}:${el ? (getComputedStyle(el.querySelector('div') as HTMLElement).color === 'rgb(74, 77, 66)') : 'absent'}`);
        }
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await page.getByTestId('share-916').click();
  // The printing line is up while the card renders; the keys are gone and BACK is inert.
  await expect(page.getByTestId('share-916')).toHaveCount(0);
  await expect(page.getByTestId('share-panel')).toHaveCount(0, { timeout: 120_000 });
  const sampled = await page.evaluate(() => (window as unknown as { __deepWhilePrinting: number[] }).__deepWhilePrinting);
  expect(sampled.length).toBeGreaterThan(0);
  expect(sampled.every((n) => n === 0)).toBe(true);
  // While printing every key is inert (the card render cannot be skipped) and THERM does not work.
  const inert = await page.evaluate(() => (window as unknown as { __inertWhilePrinting: string[] }).__inertWhilePrinting);
  expect(inert.length).toBeGreaterThan(0);
  expect(inert.filter((e) => !e.endsWith(':true'))).toEqual([]);
  let log = await shareLog(page);
  expect(log).toHaveLength(1);
  expect(log[0]!.format).toBe('story');
  expect(log[0]!.fileName).toBe('field-card-0007-simulated.png');
  expect(log[0]!.title).toBe('Send field card · CASE 0007');
  expect(log[0]!.uri.startsWith('data:image/png;base64,')).toBe(true);
  expect(await dims(page, log[0]!.uri)).toEqual({ w: 1080, h: 1920 });

  await page.getByTestId('key-share').click();
  await page.getByTestId('share-11').click();
  await expect(page.getByTestId('share-panel')).toHaveCount(0, { timeout: 120_000 });
  log = await shareLog(page);
  expect(log).toHaveLength(2);
  expect(log[1]!.format).toBe('square');
  // The file name carries `simulated` for both formats.
  expect(log[1]!.fileName).toBe('field-card-0007-simulated.png');
  expect(await dims(page, log[1]!.uri)).toEqual({ w: 1080, h: 1080 });
  check();
});

test('a printer fault prints E-31, saves nothing and keeps the key live', async ({ page }) => {
  const check = watch(page);
  await page.goto(`${ACTIVE}&share=fail`);
  await expect(page.getByTestId('key-share')).toBeEnabled();
  await page.getByTestId('key-share').click();
  await page.getByTestId('share-11').click();
  await offerAt(page, 'E-31 PRINTER FAULT. CARD NOT SAVED.');
  await expect(page.getByTestId('deepscan-key')).toHaveCount(0);
  expect(await shareLog(page)).toEqual([]);
  await expect(page.getByTestId('key-share')).toBeEnabled();
  check();
});

test('goldens: the offer line and the format choice', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-390x844', 'goldens at 390 only');
  const check = watch(page);
  await page.goto(`${ACTIVE}&share=offer`);
  await offerAt(page, 'Field card ready. SHARE prints it.');
  await settle(page);
  await expect(page).toHaveScreenshot('result-share-offer.png', { maxDiffPixels: 150 });
  await page.goto(`${ACTIVE}&share=format`);
  await expect(page.getByTestId('share-panel')).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot('result-share-format.png', { maxDiffPixels: 150 });
  check();
});

test('no ad-starting key shares the glass with the share moment', async ({ page }) => {
  const check = watch(page);
  // The offer line is up: key 4 is a dark cap and nothing sponsored prints, the SHARE legend is lit (p5).
  await page.goto(`${ACTIVE}&share=offer`);
  await offerAt(page, 'Field card ready. SHARE prints it.');
  await expect(page.getByTestId('deepscan-key')).toHaveCount(0);
  await expect(page.getByTestId('deepscan-line')).toHaveCount(0);
  await expect(page.getByText(/sponsored video/i)).toHaveCount(0);
  // Format mode: the format keys carry STORY and SQUARE and nothing starts a card by itself.
  await page.goto(`${ACTIVE}&share=format`);
  await expect(page.getByTestId('share-panel')).toBeVisible();
  await expect(page.getByTestId('share-line')).toHaveText('Print field card. Format?');
  // Only the key row changes: the reading rows stay on the glass, and no band opens under the format line.
  await expect(page.getByText('FLUX', { exact: true })).toBeVisible();
  await expect(page.getByText('ACOUST', { exact: true })).toBeVisible();
  const lineBox = (await page.getByTestId('share-panel').boundingBox())!;
  const fluxBox = (await page.getByText('FLUX', { exact: true }).boundingBox())!;
  expect(fluxBox.y - (lineBox.y + lineBox.height)).toBeLessThan(12);
  expect(await shareLog(page)).toEqual([]);
  await expect(page.getByTestId('share-916')).toContainText('STORY');
  await expect(page.getByTestId('share-11')).toContainText('SQUARE');
  // CANCEL returns to the resting row; with the offer gone and the share state idle key 4 is back, no line yet.
  await page.getByTestId('key-back').click();
  await expect(page.getByTestId('key-share')).toBeVisible();
  await expect(page.getByTestId('deepscan-key')).toBeVisible();
  await expect(page.getByTestId('deepscan-line')).toHaveCount(0);
  check();
});
