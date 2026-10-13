#!/usr/bin/env node
// Ghost measurement (P3-04). Exports the web build, serves it, screenshots the photo panel of each
// fixture with and without the ghost, and prints the luma difference (Rec. 601) per fixture.
//
//   node scripts/measure-ghost.mjs [--no-export] [--route probe|result] [--demo active] [--json]
//
// --route probe  (default) /composite-probe?static=1&fixture=<f>&demo=<d>, compositor v1. The probe
//                publishes the placement on window.__composite, so the figure box is exact.
// --route result /result/demo?static=1&demo=<d>&fixture=<f>&v=1, the result screen. Its <Composite>
//                publishes the placement and clamp reference on window.__composite under
//                ?static=1 too, so the box and the clamp are checked the same way. Without it (v0
//                fallback) the figure box is the bounding box of pixels lifted by 2 or more and the
//                clamp is not checked.
// The "without" shot adds `&ghost=0`. Both shots carry the same grain, so the difference is the
// ghost alone. Differences are computed in the browser from the two screenshots (never by reading
// pixels back from the Skia canvas).
//
// Targets: mean lift in the figure box 8 to 20, darkened 0, union box <= 15% of the panel,
// figure centre 15 to 40% in from a side edge and 10% clear of the top and bottom.
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const route = opt('route', 'probe');
const demo = opt('demo', 'active');
const variant = opt('variant', null); // probe only: force a variant (0..5 or png)
const out = opt('out', join(tmpdir(), 'ghost-measure-dist'));
const port = Number(opt('port', '4183'));
const FIXTURES = ['cellar', 'attic', 'bright', 'black', 'outdoors'];

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(' ')} failed`);
}

if (!flag('no-export')) {
  run('node', ['scripts/copy-canvaskit.mjs']);
  run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', out]);
}

const server = spawn('node', [join(root, 'e2e/web/serve.mjs'), out], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const base = `http://localhost:${port}`;
for (let i = 0; i < 50; i++) {
  try {
    await fetch(base);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 200));
  }
}

const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-font-subpixel-positioning', '--disable-lcd-text'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror: ${String(e).slice(0, 300)}`));
page.on('console', (m) => m.type() === 'error' && console.error(`console: ${m.text().slice(0, 300)}`));
const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function shot(url, testId, ready) {
  for (let attempt = 0; ; attempt++) {
    await page.goto(`${base}${url}`);
    try {
      await page.getByTestId(ready).first().waitFor({ timeout: 45000 });
      break;
    } catch (e) {
      if (attempt >= 2) throw e;
      console.error(`retry ${url}`);
    }
  }
  await frames();
  await page.waitForTimeout(300);
  await frames();
  const el = page.getByTestId(testId).first();
  return { png: (await el.screenshot()).toString('base64'), info: await page.evaluate(() => globalThis.__composite ?? null) };
}

// Runs in the page: decode both PNGs, diff luma per pixel, summarise.
async function diff(withB64, withoutB64, info) {
  return page.evaluate(
    async ({ a, b, info }) => {
      const load = (src) =>
        new Promise((res, rej) => {
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = rej;
          img.src = `data:image/png;base64,${src}`;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const W = ia.naturalWidth;
      const H = ia.naturalHeight;
      const read = (img) => {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, W, H).data;
      };
      const da = read(ia);
      const db = read(ib);
      const L = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const lift = new Float32Array(W * H);
      let darkened = 0;
      let overLimit = 0;
      // Clamp check: the ghost may lift a pixel to clampRef + clampLift (published, 30) at most. Grain (up to 0.04 * 255)
      // sits on both shots, so the bound carries that slack plus 1 for rounding.
      const limit = info ? info.clampRef + (info.clampLift ?? 24) : Infinity;
      let maxLift = 0;
      let lifted = 0;
      let bx0 = W;
      let by0 = H;
      let bx1 = -1;
      let by1 = -1;
      for (let p = 0; p < W * H; p++) {
        const d = L(da, p * 4) - L(db, p * 4);
        lift[p] = d;
        if (d < -1e-6) darkened++;
        if (d > 0.5 && d > limit - L(db, p * 4) + 0.04 * 255 + 1) overLimit++;
        if (d > maxLift) maxLift = d;
        if (d >= 2) {
          lifted++;
          const x = p % W;
          const y = (p - x) / W;
          bx0 = Math.min(bx0, x);
          bx1 = Math.max(bx1, x);
          by0 = Math.min(by0, y);
          by1 = Math.max(by1, y);
        }
      }
      let box;
      let union;
      if (info) {
        const pl = info.placement;
        box = { x: pl.x, y: pl.y, w: pl.w, h: pl.h };
        const xs = [0, ...pl.offsetCopies.map((c) => c.dx), pl.echo?.dx ?? 0];
        const ys = [0, ...pl.offsetCopies.map((c) => c.dy), pl.echo?.dy ?? 0];
        const ux0 = Math.max(0, pl.x + Math.min(...xs));
        const uy0 = Math.max(0, pl.y + Math.min(...ys));
        const ux1 = Math.min(W, pl.x + pl.w + Math.max(...xs));
        const uy1 = Math.min(H, pl.y + pl.h + Math.max(...ys));
        union = (Math.max(0, ux1 - ux0) * Math.max(0, uy1 - uy0)) / (W * H);
      } else {
        box = bx1 < 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: bx0, y: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1 };
        union = (box.w * box.h) / (W * H);
      }
      let sum = 0;
      let bgSum = 0;
      let n = 0;
      const x0 = Math.max(0, Math.floor(box.x));
      const y0 = Math.max(0, Math.floor(box.y));
      const x1 = Math.min(W, Math.ceil(box.x + box.w));
      const y1 = Math.min(H, Math.ceil(box.y + box.h));
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          sum += lift[y * W + x];
          bgSum += L(db, (y * W + x) * 4);
          n++;
        }
      return {
        panel: `${W}x${H}`,
        meanLift: n ? sum / n : 0,
        boxBg: n ? bgSum / n : 0,
        overLimit,
        maxLift,
        darkened,
        liftedShare: lifted / (W * H),
        union,
        cx: (box.x + box.w / 2) / W,
        cy: (box.y + box.h / 2) / H,
      };
    },
    { a: withB64, b: withoutB64, info },
  );
}

const rows = [];
try {
  for (const fx of FIXTURES) {
    const url =
      route === 'result'
        ? `/result/demo?static=1&demo=${demo}&fixture=${fx}&v=1`
        : `/composite-probe?static=1&fixture=${fx}&demo=${demo}${variant !== null ? `&variant=${variant}` : ''}`;
    const [testId, ready] = route === 'result' ? ['result-photo', 'result-photo'] : ['composite-probe', 'composite'];
    const a = await shot(url, testId, ready);
    const b = await shot(`${url}&ghost=0`, testId, ready);
    const info = a.info;
    const m = await diff(a.png, b.png, info);
    const sideIn = Math.min(m.cx, 1 - m.cx);
    const ok =
      m.meanLift >= 8 && m.meanLift <= 20 && m.darkened === 0 && m.overLimit === 0 && m.union <= 0.15 && sideIn >= 0.15 - 1e-3 && sideIn <= 0.4 + 1e-3 && m.cy >= 0.1 && m.cy <= 0.9;
    rows.push({ fixture: fx, variant: info?.variant ?? '-', opacity: info?.placement.opacity, meanLuma: info?.meanLuma, clampRef: info?.clampRef, clampChecked: !!info, ...m, ok: ok && !!info });
  }
} finally {
  await browser.close();
  server.kill();
}

if (flag('json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const f = (v, d = 1) => (typeof v === 'number' ? v.toFixed(d) : String(v));
  console.log(`\nroute=${route} demo=${demo} viewport 390x844 @1x\n`);
  console.log('| fixture | variant | opacity | region mean | clamp ref | box bg | mean lift in figure box | max lift | darkened px | over clamp px | lifted px (>= 2) | union box | centre (x, y) | target |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  // `over clamp px` reads "n/a" (and the row fails) when the page published no placement.
  for (const r of rows)
    console.log(
      `| ${r.fixture} | ${r.variant} | ${f(r.opacity, 3)} | ${f(r.meanLuma)} | ${f(r.clampRef)} | ${f(r.boxBg)} | ${f(r.meanLift)} | ${f(r.maxLift, 0)} | ${r.darkened} | ${r.clampChecked ? r.overLimit : 'n/a'} | ${f(r.liftedShare * 100)}% | ${f(r.union * 100)}% | ${f(r.cx, 2)}, ${f(r.cy, 2)} | ${r.ok ? 'PASS' : 'FAIL'} |`,
    );
}
process.exitCode = rows.every((r) => r.ok) ? 0 : 1;
