import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

// P6-01: the share card through the public renderShareCard on the web path (data URL), scaled to
// fit on /share-probe. Goldens at 390 only, Skia tolerance as the other Skia goldens. The third
// case is a STRONG capture that was never Deep Scanned: `SIGNATURE [n]% DECODED` (D-034 b).
// D-045: the compare is the full-size PNG decoded from the data URL against a full-size golden at
// maxDiffPixels 100. Noise floor measured over five renders of each of the six cards: byte-identical,
// max channel difference 0 and 0 differing pixels. The six full-size files total 13.2 MB, under the
// 15 MB line, so no crop fallback. The card is drawn by Skia on a CPU surface, so it does not depend on
// the viewport: the golden is taken at 390 only.
// P7-06: `share-story-<lang>` renders the same case through `?lang=`, one golden per locale whose
// file is present (locales/<lang>.json); a locale without its file has no case yet.
const hasLocale = (lang: string) => existsSync(join(process.cwd(), 'locales', `${lang}.json`));
const CASES: { name: string; format: 'story' | 'square'; kase: string; lang?: string }[] = [
  { name: 'share-story', format: 'story', kase: 'critical-deep' },
  { name: 'share-square', format: 'square', kase: 'critical-deep' },
  { name: 'share-story-undecoded', format: 'story', kase: 'strong-undecoded' },
  ...(['de', 'es', 'pt'] as const).filter(hasLocale).map((lang) => ({ name: `share-story-${lang}`, format: 'story' as const, kase: 'critical-deep', lang })),
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
    const png = Buffer.from(src!.slice('data:image/png;base64,'.length), 'base64');
    expect(png).toMatchSnapshot(`${name}-full.png`, { maxDiffPixels: 100 });
    expect(errors).toEqual([]);
  });
}
