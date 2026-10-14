#!/usr/bin/env node
// Ghost measurement (P3-04). Exports the web build, serves it, screenshots the photo panel of each
// fixture with and without the ghost, and prints the luma difference (Rec. 601) per fixture.
//
//   node scripts/measure-ghost.mjs [--no-export] [--route probe|result] [--demo active] [--fixture a,b]
//                                  [--runs 2] [--no-warp-pass] [--json]
//
// --route probe  (default) /composite-probe?static=1&fixture=<f>&demo=<d>, compositor v1. The probe
//                publishes the placement on window.__composite, so the figure box is exact.
// --route result /result/demo?static=1&demo=<d>&fixture=<f>&v=1&warp=0, the result screen with the flat
//                glass: the clamp is accepted before the barrel warp (the warp resamples the finished
//                screen, a lens, not the composite). A second pass with the warp on, as shipped, is
//                printed as information and never fails the run (--no-warp-pass skips it). Its <Composite>
//                publishes the placement and clamp reference on window.__composite under
//                ?static=1 too, so the box and the clamp are checked the same way. Without it (v0
//                fallback) the figure box is the bounding box of pixels lifted by 2 or more and the
//                clamp is not checked.
// The "without" shot adds `&ghost=0`. Both shots carry the same grain, so the difference is the
// ghost alone. Differences are computed in the browser from the two screenshots (never by reading
// pixels back from the Skia canvas).
//
// Targets: mean lift in the figure box 8 to 20 (on a near-black scene, the smudge fallback of
// D-023: 6 to 12, max lift 18), darkened 0, union box <= 15% of the panel, figure centre 15 to 40%
// in from a side edge and 10% clear of the top and bottom, at least 10% of the figure cut by the
// scene's edges or, on a flat interior, the synthesised foreground mass (the compositor's own
// figure, published on window.__composite: gradient, band, cut), and no mass on an edge-rich
// (gradient 2.5 or more) or near-black scene.
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
const fixtures = opt('fixture', null)?.split(',') ?? FIXTURES;
const runs = Math.max(1, Number(opt('runs', '2')));

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
const sameBytes = (a, b) => a.length === b.length && a.equals(b);

// One deterministic capture. After the ready element: the fonts, then (ghost shots) the published
// `window.__composite`, then (warped glass) the warped snapshot layer, then two animation frames.
// It then screenshots `clip` (the ghost shot's box, so both shots of a pair share one page area and
// size), or the element's box when no clip is given, until two consecutive screenshots are
// byte-identical (static grain, so a settled page repeats exactly). Up to 10 tries.
async function shot(url, testId, ready, { composite, warped, clip }) {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(`${base}${url}`);
      await page.getByTestId(ready).first().waitFor({ timeout: 45000 });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      if (composite) await page.waitForFunction(() => !!globalThis.__composite, null, { timeout: 20000 });
      if (warped) await page.locator('[data-testid$="-glass-warp-warped"]').first().waitFor({ timeout: 20000 });
      break;
    } catch (e) {
      if (attempt >= 2) throw e;
      console.error(`retry ${url}`);
    }
  }
  await frames();
  const el = page.getByTestId(testId).first();
  const bb = await el.boundingBox();
  const box = clip ?? { x: Math.round(bb.x), y: Math.round(bb.y), width: Math.round(bb.width), height: Math.round(bb.height) };
  let prev = await page.screenshot({ clip: box });
  let settled = false;
  for (let i = 0; i < 10 && !settled; i++) {
    await frames();
    await page.waitForTimeout(150);
    const next = await page.screenshot({ clip: box });
    settled = sameBytes(prev, next);
    prev = next;
  }
  if (!settled) console.error(`unsettled ${url}`);
  return { png: prev.toString('base64'), box, settled, info: await page.evaluate(() => globalThis.__composite ?? null) };
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
      const overAt = [];
      // Clamp check: the ghost may lift a pixel to clampRef + clampLift (published; CLAMP_LIFT 34, plus POP_LIFT on
      // the pop frame, NEAR_BLACK_LIFT 18 on a near-black scene) at most. Grain (published: up to 0.04 * 255, 1.5x
      // on a near-black scene) sits on both shots, so the bound carries that slack plus 1 for rounding.
      const limit = info ? info.clampRef + (info.clampLift ?? 34) : Infinity;
      const grainSlack = (info?.grain ?? 0.04) * 255;
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
        if (d > 0.5 && d > limit - L(db, p * 4) + grainSlack + 1) {
          overLimit++;
          overAt.push(p);
        }
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
        // Where the over-clamp pixels sit: rows and x span, with the no-ghost luma and the lift there.
        over: overAt.length
          ? {
              rows: [...new Set(overAt.map((p) => Math.floor(p / W)))],
              x: [Math.min(...overAt.map((p) => p % W)), Math.max(...overAt.map((p) => p % W))],
              bg: [Math.min(...overAt.map((p) => L(db, p * 4))), Math.max(...overAt.map((p) => L(db, p * 4)))],
              lift: [Math.min(...overAt.map((p) => lift[p])), Math.max(...overAt.map((p) => lift[p]))],
            }
          : null,
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

// One pass: each fixture captured `runs` times (ghost and no-ghost per run). A target fails the row
// only when it fails in every run; a mean lift that moves by more than 0.5 luma between runs fails
// it too (the capture is not deterministic).
async function pass(name, extra, warped) {
  const out = [];
  for (const fx of fixtures) {
    const url =
      route === 'result'
        ? `/result/demo?static=1&demo=${demo}&fixture=${fx}&v=1${extra}`
        : `/composite-probe?static=1&fixture=${fx}&demo=${demo}${variant !== null ? `&variant=${variant}` : ''}`;
    const [testId, ready] = route === 'result' ? ['result-photo', 'result-photo'] : ['composite-probe', 'composite'];
    const runsOut = [];
    for (let r = 0; r < runs; r++) {
      const a = await shot(url, testId, ready, { composite: true, warped });
      const b = await shot(`${url}&ghost=0`, testId, ready, { composite: false, warped, clip: a.box });
      const m = await diff(a.png, b.png, a.info);
      const sideIn = Math.min(m.cx, 1 - m.cx);
      const checks = {
        // Near-black scene (D-023): the smudge fallback, mean lift 6 to 12 and no pixel lifted past 18.
        lift: a.info?.nearBlack ? m.meanLift >= 6 && m.meanLift <= 12 && m.maxLift <= 18 + 0.5 : m.meanLift >= 8 && m.meanLift <= 20,
        darkened: m.darkened === 0,
        clamp: !!a.info && m.overLimit === 0,
        union: m.union <= 0.15,
        place: sideIn >= 0.15 - 1e-3 && sideIn <= 0.4 + 1e-3 && m.cy >= 0.1 && m.cy <= 0.9,
        cut: !!a.info && typeof a.info.cut === 'number' && a.info.cut >= 0.1,
        // D-023: never a synthesised mass on an edge-rich scene (gradient at or over 2.5) or off an interior.
        mass: !!a.info && !(a.info.band && (a.info.gradient >= 2.5 || a.info.nearBlack)),
      };
      runsOut.push({ ...m, info: a.info, settled: a.settled && b.settled, checks });
    }
    const failsAll = (k) => runsOut.every((x) => !x.checks[k]);
    const lifts = runsOut.map((x) => x.meanLift);
    const spread = Math.max(...lifts) - Math.min(...lifts);
    const failed = Object.keys(runsOut[0].checks).filter(failsAll);
    if (spread > 0.5) failed.push('spread');
    const info = runsOut[0].info;
    out.push({ pass: name, fixture: fx, variant: info?.variant ?? '-', clampRef: info?.clampRef, runs: runsOut, spread, failed, ok: failed.length === 0 });
  }
  return out;
}

let gate = [];
let infoRows = [];
try {
  if (route === 'result') {
    // The clamp is accepted before the glass warp (Director's ruling: the warp is a lens over the
    // screen, not part of the composite), so the gating pass renders the flat glass (`warp=0`). The second
    // pass, with the warp as shipped, is reported and never fails the run.
    gate = await pass('flat (warp=0)', '&warp=0', false);
    if (!flag('no-warp-pass')) infoRows = await pass('warped (info)', '', true);
  } else {
    gate = await pass('probe', '', false);
  }
} finally {
  await browser.close();
  server.kill();
}

const all = [...gate, ...infoRows];
if (flag('json')) {
  console.log(JSON.stringify(all, (k, v) => (k === 'info' ? undefined : v), 2));
} else {
  const f = (v, d = 1) => (typeof v === 'number' ? v.toFixed(d) : String(v));
  const per = (r, fn) => r.runs.map(fn).join(' / ');
  console.log(`\nroute=${route} demo=${demo} viewport 390x844 @1x, ${runs} runs per fixture (values per run)\n`);
  console.log('| pass | fixture | variant | clamp ref | mean lift | spread | max lift | darkened px | over clamp px | union box | centre (x, y) | gradient | scene median | occluder | cut | settled | target |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of all)
    console.log(
      `| ${r.pass} | ${r.fixture} | ${r.variant} | ${f(r.clampRef)} | ${per(r, (x) => f(x.meanLift))} | ${f(r.spread, 2)} | ${per(r, (x) => f(x.maxLift, 0))} | ${per(r, (x) => x.darkened)} | ${per(r, (x) => (x.info ? x.overLimit : 'n/a'))} | ${per(r, (x) => f(x.union * 100) + '%')} | ${per(r, (x) => `${f(x.cx, 2)}, ${f(x.cy, 2)}`)} | ${f(r.runs[0].info?.gradient, 2)} | ${f(r.runs[0].info?.sceneMedian, 0)}${r.runs[0].info?.nearBlack ? ' (smudge)' : ''} | ${r.runs[0].info ? (r.runs[0].info.band ? 'mass' : 'scene') : 'n/a'} | ${per(r, (x) => (typeof x.info?.cut === 'number' ? f(x.info.cut * 100) + '%' : 'n/a'))} | ${per(r, (x) => (x.settled ? 'y' : 'n'))} | ${r.pass.includes('info') ? 'info' : r.ok ? 'PASS' : `FAIL (${r.failed.join(', ')})`} |`,
    );
  for (const r of all)
    r.runs.forEach((x, i) => {
      if (x.over)
        console.log(
          `${r.pass} ${r.fixture} run ${i + 1}: over clamp rows ${x.over.rows.join(',')}, x ${x.over.x.join('..')}, no-ghost luma ${x.over.bg.map((v) => v.toFixed(0)).join('..')}, lift ${x.over.lift.map((v) => v.toFixed(0)).join('..')}`,
        );
    });
}
process.exitCode = gate.every((r) => r.ok) ? 0 : 1;
