import type { Page } from '@playwright/test';

// Wait for the warped glass snapshot to land and settle. The `*-warp-warped` node carries
// data-warped="<refreshKey>" only when the stored snapshot matches the current key (see
// src/fx/README.md). Settled means two reads 200 ms apart return the same non-empty key; a key
// that moves in between (a row reported ready, the snapshot retaken) restarts the comparison.
export async function waitWarped(page: Page, timeout = 15000): Promise<string> {
  const node = page.locator('[data-testid$="-warp-warped"]').first();
  const read = () => node.getAttribute('data-warped', { timeout: 2000 }).catch(() => null);
  const deadline = Date.now() + timeout;
  let prev: string | null = null;
  while (Date.now() < deadline) {
    const cur = await read();
    if (cur !== null && cur === prev) {
      // Two frames so the warped canvas has painted the landed snapshot.
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      return cur;
    }
    prev = cur;
    await page.waitForTimeout(200);
  }
  throw new Error(`warped snapshot did not settle within ${timeout} ms (last data-warped: ${String(prev)})`);
}
