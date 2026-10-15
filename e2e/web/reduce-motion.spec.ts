import { expect, test, type Page } from '@playwright/test';
import { startClockAtEvening, waitPrinted } from './relay';

// P8-04 clause 3. With the OS setting on (prefers-reduced-motion: reduce) the viewfinder, the result and the
// relay module hold a steady state: two screenshots one second apart differ by no more than a handful of
// pixels. A control run without the flag must differ, so the measurement cannot pass by being blind.
// The harness `static=1` is NOT used here: it freezes the page by itself and would prove nothing.

const NOISE_PX = 20; // anti-aliasing at most; real motion is tens of thousands

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

async function movement(page: Page): Promise<number> {
  const first = await page.screenshot();
  await page.waitForTimeout(1000);
  const second = await page.screenshot();
  return diffPixels(page, first, second);
}

const SURFACES: { name: string; open: (p: Page) => Promise<void> }[] = [
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
    const reduced = await movement(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    // The OS setting is read once at start (and on change events): reload to run the control.
    await page.reload();
    await surface.open(page).catch(() => undefined);
    const live = await movement(page);
    console.log(`[reduce-motion] ${surface.name}: reduced ${reduced} px, no-preference ${live} px`);
    expect(reduced).toBeLessThanOrEqual(NOISE_PX);
    expect(live).toBeGreaterThan(reduced);
  });
}
