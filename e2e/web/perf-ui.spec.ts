import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';

// P8-03, the Builder A half of the performance budget (D-046).
// - Boot: a cold load of /viewfinder at CPU x2 until the CAPTURE key is on the page and enabled,
//   measured in the page from navigation start (performance.now() at the moment a MutationObserver
//   sees the key). Budget: under 2.5 s. The cache is cold: every test gets a fresh browser context.
// - Bundle: the cold-start JS is the scripts index.html loads. The web export writes no
//   metadata.json (that file exists for native exports only), so index.html is the export's metadata:
//   its script tags name the files, and the sizes are read from the served bytes. Guard: raw size
//   at most 1.1x the baseline recorded in docs/perf.md.
// Numbers go to stdout as `[perf-ui] {...}` lines so the CI log carries them. 390 only.
const BOOT_RATE = Number(process.env.UI_CPU_RATE ?? 2);
const BOOT_MS_MAX = 2500;
/** Cold-start JS (entry bundle, raw bytes): 082aa80 was 2 986 301, with the P8-03 main-thread pass 2 986 773 (docs/perf.md). */
const BUNDLE_BASELINE_BYTES = 2_986_773;
const BUNDLE_BYTES_MAX = Math.round(1.1 * BUNDLE_BASELINE_BYTES);

test.beforeEach(({ page: _page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-390x844', 'budgets measured at 390 only');
});

async function throttle(page: Page, rate: number) {
  if (rate <= 1) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
}

test(`cold boot to an enabled CAPTURE key under ${BOOT_MS_MAX} ms at CPU x${BOOT_RATE}`, async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await throttle(page, BOOT_RATE);
  await page.addInitScript(() => {
    const w = window as unknown as { __uiInteractive?: number };
    const check = () => {
      const k = document.querySelector('[data-testid="key-capture"]');
      if (!k || w.__uiInteractive !== undefined) return;
      if (k.getAttribute('aria-disabled') === 'true' || (k as HTMLButtonElement).disabled) return;
      w.__uiInteractive = performance.now();
      obs.disconnect();
    };
    const obs = new MutationObserver(check);
    document.addEventListener('DOMContentLoaded', () => {
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-disabled', 'disabled'] });
      check();
    });
  });
  await page.goto('/viewfinder?fixture=cellar', { waitUntil: 'commit' });
  await expect(page.getByTestId('key-capture')).toBeEnabled({ timeout: 30_000 });
  const ms = await page.waitForFunction(() => (window as unknown as { __uiInteractive?: number }).__uiInteractive).then((h) => h.jsonValue());
  const boot = Math.round(ms as number);
  console.log(`[perf-ui] boot ${JSON.stringify({ cpu: BOOT_RATE, route: 'viewfinder', interactiveMs: boot, budgetMs: BOOT_MS_MAX })}`);
  expect(boot).toBeLessThan(BOOT_MS_MAX);
  expect(errors).toEqual([]);
});

test(`cold-start JS stays within 1.1x its baseline (${BUNDLE_BYTES_MAX} bytes)`, async ({ request }) => {
  const html = await (await request.get('/')).text();
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+\.js)"/g)].map((m) => m[1]!);
  expect(srcs.length).toBeGreaterThan(0);
  let raw = 0;
  let gzip = 0;
  const files: Record<string, number> = {};
  for (const src of srcs) {
    const res = await request.get(src);
    expect(res.ok()).toBe(true);
    const body = await res.body();
    raw += body.length;
    gzip += gzipSync(body).length;
    files[src.split('/').pop()!] = body.length;
  }
  console.log(`[perf-ui] bundle ${JSON.stringify({ rawBytes: raw, gzipBytes: gzip, baselineBytes: BUNDLE_BASELINE_BYTES, maxBytes: BUNDLE_BYTES_MAX, files })}`);
  expect(raw).toBeLessThanOrEqual(BUNDLE_BYTES_MAX);
});
