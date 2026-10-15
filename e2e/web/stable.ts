import type { Locator } from '@playwright/test';

// The thermal panel draws its caption and °C labels as Skia text, so the DOM cannot say when the font has
// landed. Wait until the panel's pixels repeat for `need` captures in a row, `gap` ms apart: a capture taken
// before the font loads differs from the one after it, so the run only ends once the labels are in.
export async function waitPixelsStable(view: Locator, { gap = 250, need = 3, timeout = 15000 } = {}): Promise<void> {
  const deadline = Date.now() + timeout;
  let prev: Buffer | null = null;
  let same = 0;
  while (Date.now() < deadline) {
    const cur = await view.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' });
    same = prev !== null && cur.equals(prev) ? same + 1 : 0;
    if (same >= need - 1) return;
    prev = cur;
    await view.page().waitForTimeout(gap);
  }
  throw new Error(`thermal view pixels did not settle within ${timeout} ms`);
}
