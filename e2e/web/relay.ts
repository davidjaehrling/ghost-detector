import type { Page } from '@playwright/test';

// Wait until the relay module has printed every line (data-printed="1" on its root, the same idea as
// data-warped in warped.ts). Screenshots and presses on the offer wait on this.
export async function waitPrinted(page: Page, timeout = 10000): Promise<void> {
  await page.locator('[data-testid="relay-module"][data-printed="1"]').waitFor({ state: 'visible', timeout });
}

// The viewfinder reached by KEY-BACK is not static, so its window countdown reads the wall clock and the
// golden moved with the minute. Start the page clock at 2026-10-13 20:00:20 local and let it run from
// there (a fake-timer clock would stop the frame callbacks; the 500 ms guards need real elapsed time).
export async function startClockAtEvening(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const offset = new Date(2026, 9, 13, 20, 0, 20).getTime() - Date.now();
    const Real = Date;
    class Shifted extends Real {
      constructor(...a: unknown[]) {
        if (a.length === 0) super(Real.now() + offset);
        // @ts-expect-error spread into the Date constructor
        else super(...a);
      }
      static now() {
        return Real.now() + offset;
      }
    }
    // @ts-expect-error replace the global
    window.Date = Shifted;
  });
}
