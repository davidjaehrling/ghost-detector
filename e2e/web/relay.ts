import type { Page } from '@playwright/test';

// Wait until the relay module has printed every line (data-printed="1" on its root, the same idea as
// data-warped in warped.ts). Screenshots and presses on the offer wait on this.
export async function waitPrinted(page: Page, timeout = 10000): Promise<void> {
  await page.locator('[data-testid="relay-module"][data-printed="1"]').waitFor({ state: 'visible', timeout });
}
