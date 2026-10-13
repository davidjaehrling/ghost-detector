// Generates the web-harness fixture photos (768x1024) with the installed
// Playwright Chromium drawing on a canvas. Seeded: the same script gives the
// same pixels. Run: node scripts/gen-fixtures.mjs
// Sources live in e2e/fixtures/; assets/fixtures/ holds the copies Metro serves.
import { chromium } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 768;
const H = 1024;

// Runs inside the page. `name` selects the scene.
function draw(name, W, H) {
  let a = [...name].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const lin = (x0, y0, x1, y1, stops) => {
    const l = g.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, col]) => l.addColorStop(o, col));
    return l;
  };
  const rad = (x, y, r, stops) => {
    const l = g.createRadialGradient(x, y, 0, x, y, r);
    stops.forEach(([o, col]) => l.addColorStop(o, col));
    return l;
  };
  const rect = (fill, x, y, w, h) => {
    g.fillStyle = fill;
    g.fillRect(x, y, w, h);
  };
  const noise = (amount, mono = true) => {
    const d = g.getImageData(0, 0, W, H);
    for (let i = 0; i < d.data.length; i += 4) {
      const n = (rnd() - 0.5) * amount;
      d.data[i] += n;
      d.data[i + 1] += mono ? n : (rnd() - 0.5) * amount;
      d.data[i + 2] += mono ? n : (rnd() - 0.5) * amount;
    }
    g.putImageData(d, 0, 0);
  };
  const poly = (fill, pts) => {
    g.fillStyle = fill;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
  };

  if (name === 'cellar') {
    rect(lin(0, 0, 0, H, [[0, '#2a2620'], [0.55, '#4a4338'], [1, '#1e1a16']]), 0, 0, W, H);
    // back wall of stone blocks
    for (let row = 0; row < 14; row++) {
      let x = -((row % 2) * 40);
      while (x < W) {
        const w = 70 + rnd() * 60;
        const sh = 40 + Math.floor(rnd() * 40);
        g.fillStyle = `rgb(${sh + 22},${sh + 16},${sh + 8})`;
        g.fillRect(x + 2, 180 + row * 40 + 2, w - 4, 36);
        x += w;
      }
    }
    // floor
    poly(lin(0, 700, 0, H, [[0, '#2b2721'], [1, '#14110e']]), [[0, 700], [W, 700], [W, H], [0, H]]);
    // dark corner, lower left
    rect(rad(40, 760, 420, [[0, 'rgba(0,0,0,0.97)'], [0.55, 'rgba(0,0,0,0.8)'], [1, 'rgba(0,0,0,0)']]), 0, 300, 520, 724);
    // arched door frame
    rect('#1b1713', 470, 330, 170, 370);
    rect('#0d0b09', 484, 346, 142, 354);
    // bare bulb on a cord, top right
    g.strokeStyle = '#0c0a08';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(600, 0);
    g.lineTo(600, 150);
    g.stroke();
    rect(rad(600, 175, 330, [[0, 'rgba(255,236,190,0.95)'], [0.12, 'rgba(255,214,140,0.6)'], [0.4, 'rgba(255,190,100,0.16)'], [1, 'rgba(255,190,100,0)']]), 200, 0, 568, 560);
    g.fillStyle = '#fff6d8';
    g.beginPath();
    g.arc(600, 178, 20, 0, 7);
    g.fill();
    // crates
    rect('#3a2e20', 300, 640, 140, 100);
    rect('#2a2016', 300, 640, 140, 8);
    rect('#33291c', 330, 580, 90, 62);
    noise(18);
  } else if (name === 'attic') {
    rect(lin(0, 0, 0, H, [[0, '#1c1a1f'], [1, '#3a332b']]), 0, 0, W, H);
    // roof slope planks
    for (let i = 0; i < 18; i++) {
      const y = i * 58;
      rect(i % 2 ? '#3c3328' : '#41372b', 0, y, W, 56);
      rect('rgba(0,0,0,0.35)', 0, y + 54, W, 3);
    }
    // gable (dark triangle) in the back
    poly('#050505', [[130, 640], [384, 180], [638, 640]]);
    poly('rgba(0,0,0,0.9)', [[60, 760], [384, 120], [708, 760]]);
    // beams
    poly('#241c14', [[0, 0], [90, 0], [420, 760], [330, 760]]);
    poly('#241c14', [[W, 0], [W - 90, 0], [W - 420, 760], [W - 330, 760]]);
    rect('#2b2118', 0, 560, W, 46);
    rect('#1f1810', 0, 596, W, 8);
    // floor boards
    poly('#2a241d', [[0, 780], [W, 780], [W, H], [0, H]]);
    for (let i = 0; i < 9; i++) rect('rgba(0,0,0,0.4)', i * 90, 780, 3, 244);
    // skylight shaft
    poly('rgba(220,226,238,0.18)', [[560, 0], [660, 0], [520, 780], [330, 780]]);
    rect(rad(610, 20, 200, [[0, 'rgba(235,238,250,0.55)'], [1, 'rgba(235,238,250,0)']]), 400, 0, 368, 260);
    // dust
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(230,230,240,${0.05 + rnd() * 0.18})`;
      g.fillRect(380 + rnd() * 260, rnd() * 760, 2, 2);
    }
    rect(rad(W / 2, H / 2, 700, [[0.4, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.5)']]), 0, 0, W, H);
    noise(16);
  } else if (name === 'bright') {
    rect(lin(0, 0, 0, H, [[0, '#f4f1e6'], [1, '#d9d3c0']]), 0, 0, W, H);
    // window
    rect('#ffffff', 90, 130, 330, 420);
    g.strokeStyle = '#cfc8b4';
    g.lineWidth = 10;
    g.strokeRect(90, 130, 330, 420);
    rect('#cfc8b4', 250, 130, 10, 420);
    rect('#cfc8b4', 90, 336, 330, 10);
    // sofa
    rect('#b8a98c', 70, 700, 520, 150);
    rect('#a99a7d', 70, 640, 520, 70);
    rect('#c7b99d', 100, 740, 220, 80);
    rect('#c7b99d', 340, 740, 220, 80);
    // lamp and rug
    rect('#8d7f66', 600, 330, 10, 420);
    poly('#efe3bd', [[570, 330], [640, 330], [662, 270], [548, 270]]);
    rect(lin(0, 860, 0, H, [[0, '#cbbf9f'], [1, '#b7ab8c']]), 0, 860, W, H - 860);
    rect(rad(250, 330, 560, [[0, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]), 0, 0, W, H);
    noise(10);
  } else if (name === 'black') {
    rect('#030303', 0, 0, W, H);
    noise(14);
    const d = g.getImageData(0, 0, W, H);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = Math.max(0, Math.min(14, d.data[i] - 2));
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    }
    g.putImageData(d, 0, 0);
  } else if (name === 'outdoors') {
    rect(lin(0, 0, 0, H, [[0, '#7fa3c9'], [0.45, '#bcd3e3'], [0.6, '#cfdcc2'], [1, '#7a8b57']]), 0, 0, W, H);
    // clouds
    for (let i = 0; i < 9; i++) {
      const cx = rnd() * W;
      const cy = 300 + rnd() * 220;
      rect(rad(cx, cy, 120, [[0, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']]), cx - 130, cy - 130, 260, 260);
    }
    // grass field
    poly(lin(0, 620, 0, H, [[0, '#6b8247'], [1, '#42562c']]), [[0, 640], [W, 600], [W, H], [0, H]]);
    // path
    poly('#a99872', [[330, H], [450, H], [410, 660], [380, 660]]);
    // dark tree line across the top
    g.fillStyle = '#0b130c';
    g.fillRect(0, 0, W, 90);
    for (let x = -20; x < W + 20; x += 14) {
      const h = 90 + rnd() * 140 + 50 * Math.sin(x / 90);
      poly('#0b130c', [[x - 22, 0], [x + 22, 0], [x + (rnd() - 0.5) * 10, h]]);
    }
    rect(lin(0, 0, 0, 280, [[0, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]), 0, 0, W, 280);
    // single trunk
    rect('#2a1f14', 560, 560, 26, 120);
    poly('#26391f', [[480, 600], [573, 360], [666, 600]]);
    noise(14, false);
  } else {
    throw new Error(`unknown scene ${name}`);
  }
  return c.toDataURL('image/png');
}

const scenes = ['cellar', 'attic', 'bright', 'black', 'outdoors'];
const outDir = join(root, 'e2e', 'fixtures');
const assetDir = join(root, 'assets', 'fixtures');
mkdirSync(outDir, { recursive: true });
mkdirSync(assetDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
for (const name of scenes) {
  const url = await page.evaluate(`(${draw.toString()})(${JSON.stringify(name)}, ${W}, ${H})`);
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  copyFileSync(file, join(assetDir, `${name}.png`));
  console.log(`wrote ${name}.png`);
}
await browser.close();
