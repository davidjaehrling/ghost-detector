import { expect, test, type Page } from '@playwright/test';

// One lit treatment for every lit key (bible section 2): the legend at p5 and a 1 px p3 rim. A key that
// is not lit has neither. The relay keys are covered in relay.spec.ts.
const P5 = 'rgb(212, 255, 220)';
const P3 = 'rgb(79, 180, 106)';
const ACTIVE = '/result/demo?static=1&fixture=cellar&demo=active';

async function look(page: Page, id: string) {
  return page.getByTestId(id).last().evaluate((e) => {
    const cs = getComputedStyle(e);
    const legend = getComputedStyle(e.querySelector('div') as HTMLElement);
    return { rim: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`, legend: legend.color };
  });
}

const LIT = { rim: `1px solid ${P3}`, legend: P5 };

test('SHARE (offer), PHOTO, DEEP SCAN (armed) and the format keys share one lit treatment', async ({ page }) => {
  await page.goto(`${ACTIVE}&share=offer`);
  await expect(page.getByTestId('key-share')).toBeVisible();
  expect(await look(page, 'key-share')).toEqual(LIT);

  await page.goto(`${ACTIVE}&therm=1`);
  await expect(page.getByTestId('key-therm')).toHaveText('PHOTO');
  expect(await look(page, 'key-therm')).toEqual(LIT);
  // A resting key has no rim and a dimmer legend.
  const rest = await look(page, 'key-share');
  expect(rest.rim).not.toContain('1px solid');
  expect(rest.legend).not.toBe(P5);

  await page.goto(`${ACTIVE}&deeparm=1`);
  await expect(page.getByTestId('deepscan-key')).toBeVisible();
  expect(await look(page, 'deepscan-key')).toEqual(LIT);

  await page.goto(`${ACTIVE}&share=format`);
  await expect(page.getByTestId('share-916')).toBeVisible();
  expect(await look(page, 'share-916')).toEqual(LIT);
  expect(await look(page, 'share-11')).toEqual(LIT);
});

test('RESET on the fault screen carries the same lit treatment', async ({ page }) => {
  await page.goto('/viewfinder?static=1&fault=skia');
  await expect(page.getByTestId('key-reset')).toBeVisible();
  expect(await look(page, 'key-reset')).toEqual(LIT);
});
