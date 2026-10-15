import { expect, test, type Page } from '@playwright/test';
import { startClockAtEvening, waitPrinted } from './relay';

// P8-04 clause 3. With the OS setting on (prefers-reduced-motion: reduce) the viewfinder, the result and the
// relay module hold a steady state: two screenshots one second apart differ by no more than a handful of
// pixels. A control run without the flag must differ, so the measurement cannot pass by being blind.
// The harness `static=1` is NOT used here: it freezes the page by itself and would prove nothing.

const NOISE_PX = 150; // anti-aliasing and a blinking cursor at most; real motion is thousands of pixels (the scan clip: 9000)

/** Pixels that differ by more than 1 per channel (the grain flicker is a few levels) between two PNGs, counted in a scratch page. */
async function diffPixels(page: Page, a: Buffer, b: Buffer): Promise<number> {
  const scratch = await page.context().newPage();
  try {
    return await scratch.evaluate(
      async ([x, y]) => {
        const load = (b64: string) =>
          new Promise<ImageData>((res, rej) => {
            const img = new Image();
            img.onload = () => {
              const c = document.createElement('canvas');
              c.width = img.width;
              c.height = img.height;
              const g = c.getContext('2d')!;
              g.drawImage(img, 0, 0);
              res(g.getImageData(0, 0, img.width, img.height));
            };
            img.onerror = () => rej(new Error('decode'));
            img.src = `data:image/png;base64,${b64}`;
          });
        const [p, q] = await Promise.all([load(x!), load(y!)]);
        let n = 0;
        for (let i = 0; i < p.data.length; i += 4) {
          if (Math.abs(p.data[i]! - q.data[i]!) > 1 || Math.abs(p.data[i + 1]! - q.data[i + 1]!) > 1 || Math.abs(p.data[i + 2]! - q.data[i + 2]!) > 1) n++;
        }
        return n;
      },
      [a.toString('base64'), b.toString('base64')],
    );
  } finally {
    await scratch.close();
  }
}

type Clip = { x: number; y: number; width: number; height: number };

async function movement(page: Page, clip?: (p: Page) => Promise<Clip>, attempts = 1): Promise<number> {
  let best = Infinity;
  for (let i = 0; i < attempts && best > NOISE_PX; i++) {
    const c = clip ? await clip(page) : undefined;
    const first = await page.screenshot({ clip: c });
    await page.waitForTimeout(1000);
    const second = await page.screenshot({ clip: c });
    best = Math.min(best, await diffPixels(page, first, second));
  }
  return best;
}

/** The union of the boxes of the given test ids. */
const boxOf = (ids: string[]) => async (p: Page): Promise<Clip> => {
  const boxes = await Promise.all(ids.map(async (id) => (await p.getByTestId(id).first().boundingBox())!));
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };
};

const SURFACES: { name: string; open: (p: Page) => Promise<void>; clip?: (p: Page) => Promise<Clip>; attempts?: number }[] = [
  {
    // The boot screen once the ACK key is live: the priming transient is at its logged end state.
    name: 'boot',
    open: async (p) => {
      await p.addInitScript(() => localStorage.setItem('fs4.belief.v1', 'unsure'));
      await p.goto('/?fixture=cellar');
      await expect(p.getByTestId('key-acknowledge')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30000 });
      await p.waitForTimeout(3000);
    },
  },
  {
    // The scan theatre: the trace and sweep freeze at 5 s steps, the live value and RATE hold likewise (the
    // progress bar and phase lines keep advancing, they are progress). Measured on the live and rate readouts (the Skia trace still shimmers inside ScopeLayer, an FX item);
    // a 5 s step can fall inside the window, so the measure may retry.
    name: 'scan readouts',
    open: async (p) => {
      await p.goto('/scan?fixture=cellar&seed=41&speed=1');
      await expect(p.getByTestId('scan-live')).toBeVisible();
      await p.waitForTimeout(1500);
    },
    clip: boxOf(['scan-live', 'scan-rate']),
    attempts: 4,
  },
  {
    name: 'viewfinder',
    open: async (p) => {
      await startClockAtEvening(p);
      await p.goto('/viewfinder?fixture=cellar&session=0');
      await expect(p.getByTestId('key-capture')).toBeEnabled();
      await p.waitForTimeout(2500);
    },
  },
  {
    name: 'result',
    open: async (p) => {
      // Stored case 0003 (seeded under the harness freeze); the run itself is not frozen.
      await p.goto('/history?static=1&log=demo3&session=1');
      await expect(p.getByTestId('history-row-0003').first()).toBeAttached();
      await p.goto('/result/0003?session=1');
      await expect(p.getByTestId('key-share')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 20000 });
      await p.waitForTimeout(3000);
    },
  },
  {
    name: 'relay module',
    open: async (p) => {
      await startClockAtEvening(p);
      // The demo log is seeded under the harness freeze (stored once); the run itself is not frozen.
      await p.goto('/history?static=1&log=demo3&session=1');
      await expect(p.getByTestId('history-row-0001').first()).toBeAttached();
      await p.goto('/result/0001?session=1&notify=granted');
      await p.getByTestId('screen-result').last().getByTestId('key-back').click();
      await waitPrinted(p);
      await p.waitForTimeout(1500);
    },
  },
];

for (const surface of SURFACES) {
  test(`${surface.name}: steady under reduced motion, alive without it`, async ({ page }, info) => {
    test.skip(info.project.name !== 'android-390x844', 'measured at 390');
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await surface.open(page);
    const reduced = await movement(page, surface.clip, surface.attempts);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    // The OS setting is read once at start (and on change events): reload to run the control.
    await page.reload();
    await surface.open(page).catch(() => undefined);
    const live = await movement(page, surface.clip, surface.attempts);
    console.log(`[reduce-motion] ${surface.name}: reduced ${reduced} px, no-preference ${live} px`);
    expect(reduced).toBeLessThanOrEqual(NOISE_PX);
    expect(live).toBeGreaterThan(reduced);
  });
}

// The scope trace (src/fx/scope): under the flag the route passes `still`, and the trace area must not change
// at all (byte-identical PNGs one second apart); the control without the flag keeps moving.
test('scan trace: identical under reduced motion, alive without it', async ({ page }, info) => {
  test.skip(info.project.name !== 'android-390x844', 'measured at 390');
  test.setTimeout(90_000);
  const open = async () => {
    await page.goto('/scan?fixture=cellar&seed=41&speed=1');
    await expect(page.getByTestId('scan-scope')).toBeVisible();
    await page.waitForTimeout(1500);
  };
  const shots = async () => {
    const clip = await boxOf(['scan-scope'])(page);
    const first = await page.screenshot({ clip });
    await page.waitForTimeout(1000);
    return [first, await page.screenshot({ clip })] as const;
  };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open();
  const [a, b] = await shots();
  const reduced = await diffPixels(page, a, b);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await open();
  const [c, d] = await shots();
  const live = await diffPixels(page, c, d);
  console.log(`[reduce-motion] scan trace: reduced ${reduced} px (bytes equal ${a.equals(b)}), no-preference ${live} px`);
  expect(a.equals(b)).toBe(true);
  expect(live).toBeGreaterThan(NOISE_PX);
});

// Under the flag the screens still work: RESET remounts the route, and the DEEP SCAN arm prints on the first press.
test('reduced motion: the fault screen RESET remounts the route', async ({ page }, info) => {
  test.skip(info.project.name !== 'android-390x844', 'functional check at 390');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/settings?static=1&fault=render');
  await expect(page.getByTestId('screen-fault')).toContainText('E-60 UNIT FAULT');
  await page.getByTestId('key-reset').click();
  await expect(page.getByTestId('screen-settings').last()).toBeVisible();
  await expect(page.getByTestId('screen-fault')).toHaveCount(0);
});

test('reduced motion: DEEP SCAN arms on the first press', async ({ page }, info) => {
  test.skip(info.project.name !== 'android-390x844', 'functional check at 390');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/result/demo?static=1&fixture=cellar&demo=strong');
  const key = page.getByTestId('deepscan-key');
  await expect(key).toBeVisible();
  await page.waitForTimeout(700);
  await key.click();
  await expect(page.getByTestId('deepscan-line')).toHaveText('Resolves class, era, EVP. Sponsored video plays first. DEEP SCAN again to run.');
});
