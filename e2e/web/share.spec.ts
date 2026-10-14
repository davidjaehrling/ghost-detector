import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

// P6-01: the share card through the public renderShareCard on the web path (data URL), scaled to
// fit on /share-probe. Goldens at 390 only, Skia tolerance as the other Skia goldens. The third
// case is a STRONG capture that was never Deep Scanned: `SIGNATURE [n]% DECODED` (D-034 b).
// P7-06: `share-story-<lang>` renders the same case through `?lang=`, one golden per locale whose
// file is present (locales/<lang>.json); a locale without its file has no case yet.
const hasLocale = (lang: string) => existsSync(join(process.cwd(), 'locales', `${lang}.json`));
const CASES: { name: string; format: 'story' | 'square'; kase: string; lang?: string }[] = [
  { name: 'share-story', format: 'story', kase: 'critical-deep' },
  { name: 'share-square', format: 'square', kase: 'critical-deep' },
  { name: 'share-story-undecoded', format: 'story', kase: 'strong-undecoded' },
  ...(['de'] as const).filter(hasLocale).map((lang) => ({ name: `share-story-${lang}`, format: 'story' as const, kase: 'critical-deep', lang })),
];
for (const { name, format, kase, lang } of CASES) {
  test(`share card ${name}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'android-390x844', 'goldens at 390 only');
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/share-probe?static=1&format=${format}&case=${kase}&fixture=cellar${lang ? `&lang=${lang}` : ''}`);
    const cardEl = page.getByTestId('share-card');
    await cardEl.waitFor({ timeout: 60_000 });
    const src = await cardEl.locator('img').first().getAttribute('src');
    expect(src?.startsWith('data:image/png;base64,')).toBe(true);
    const size = await page.evaluate(
      (u) => new Promise<[number, number]>((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = u; }),
      src!,
    );
    expect(size).toEqual(format === 'story' ? [1080, 1920] : [1080, 1080]);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await expect(cardEl).toHaveScreenshot(`${name}.png`, { maxDiffPixels: 400 });
    expect(errors).toEqual([]);
  });
}
