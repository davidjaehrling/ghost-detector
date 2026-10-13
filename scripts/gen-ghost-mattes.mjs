#!/usr/bin/env node
// Generates the v0 ghost mattes: assets/ghost/matte-{1,2,3}.png (512x1024, greyscale, alpha).
// Code only, no source images. Drawn on a canvas in the installed Playwright Chromium.
// Seeded: re-running reproduces the same pixels on the same Chromium build.
// Usage: node scripts/gen-ghost-mattes.mjs
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets', 'ghost');

// Each figure: a leaning spine, uneven shoulders, a head that is barely a head.
// `cut` is the fraction of height after which the figure is hidden (occlusion).
const FIGURES = [
  { seed: 0x5eed0001, lean: 0.07, shoulder: [0.24, 0.14], headShift: 0.05, headTilt: -0.25, cut: 1.0, armL: 0.4, armR: 0.0 },
  { seed: 0x5eed0002, lean: -0.1, shoulder: [0.12, 0.22], headShift: -0.07, headTilt: 0.35, cut: 1.0, armL: 0.0, armR: 0.7 },
  { seed: 0x5eed0003, lean: 0.04, shoulder: [0.2, 0.17], headShift: 0.03, headTilt: 0.15, cut: 0.62, armL: 0.25, armR: 0.2 },
];

// Runs inside the page. Must stay self-contained.
function drawMatte(fig) {
  const W = 512;
  const H = 1024;
  let a = fig.seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const make = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };

  // 1. Body: overlapping soft radial blobs along a curved spine.
  const body = make(W, H);
  const g = body.getContext('2d');
  const blob = (x, y, rx, ry, alpha) => {
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(0.55, `rgba(255,255,255,${alpha * 0.45})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, rx, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  const spineX = (t) => W * (0.5 + fig.lean * (t - 0.3) + 0.03 * Math.sin(t * 5 + fig.seed));

  // Head: a vague, tilted, lopsided density. No features.
  const hx = spineX(0.12) + W * fig.headShift;
  const hy = H * 0.115;
  for (let i = 0; i < 5; i++) {
    blob(hx + (rnd() - 0.5) * 34 + fig.headTilt * 26, hy + (rnd() - 0.5) * 40, 36 + rnd() * 18, 48 + rnd() * 22, 0.3);
  }
  // A faint, off-axis neck so the head does not float.
  blob(spineX(0.19) + W * fig.headShift * 0.5, H * 0.19, 26, 48, 0.16);
  // Shoulders: deliberately uneven.
  const sy = H * 0.255;
  blob(spineX(0.26) - W * fig.shoulder[0], sy + 12, 80, 60, 0.38);
  blob(spineX(0.26) + W * fig.shoulder[1], sy - 6, 62, 52, 0.34);
  // Torso and a long fading drape.
  for (let i = 0; i < 26; i++) {
    const t = 0.27 + (i / 25) * 0.69;
    const width = W * (0.17 + 0.06 * Math.sin(t * 3.1) - 0.06 * t) * (0.75 + rnd() * 0.5);
    const fade = 0.34 * (1 - Math.pow(t, 1.8) * 0.9);
    blob(spineX(t) + (rnd() - 0.5) * 50, H * t, width, 90 + rnd() * 60, fade);
  }
  // Arm hints, one side only on most figures.
  const arm = (side, amount) => {
    if (amount <= 0) return;
    for (let i = 0; i < 7; i++) {
      const t = 0.3 + i * 0.05;
      blob(spineX(t) + side * W * (0.2 + i * 0.012), H * t, 28 + rnd() * 12, 60, 0.22 * amount);
    }
  };
  arm(-1, fig.armL);
  arm(1, fig.armR);

  // 2. Blurred value noise (several octaves), used as the feathering mask.
  const noise = make(W, H);
  const n = noise.getContext('2d');
  n.fillStyle = '#000';
  n.fillRect(0, 0, W, H);
  const octaves = [
    [8, 16, 0.62, 40],
    [24, 48, 0.3, 14],
    [64, 128, 0.08, 5],
  ];
  for (const [gw, gh, weight, blurPx] of octaves) {
    const cell = make(gw, gh);
    const cx = cell.getContext('2d');
    const img = cx.createImageData(gw, gh);
    for (let i = 0; i < gw * gh; i++) {
      const v = Math.floor(rnd() * 255);
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    n.save();
    n.globalAlpha = weight;
    n.globalCompositeOperation = 'lighter';
    n.filter = `blur(${blurPx}px)`;
    n.imageSmoothingEnabled = true;
    n.drawImage(cell, -blurPx, -blurPx, W + blurPx * 2, H + blurPx * 2);
    n.restore();
  }

  // 3. Composite: blur the body, multiply its alpha by the noise.
  const out = make(W, H);
  const o = out.getContext('2d');
  o.filter = 'blur(14px)';
  o.drawImage(body, 0, 0);
  o.filter = 'none';
  const px = o.getImageData(0, 0, W, H);
  const nz = n.getImageData(0, 0, W, H).data;
  const cutY = fig.cut * H;
  for (let y = 0; y < H; y++) {
    // Feathered vertical fade at the bottom, plus a soft occlusion edge for cut figures.
    const bottom = Math.min(1, Math.max(0, (H - 30 - y) / 160));
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const nv = nz[i] / 255;
      // Ragged occluder edge: the cut line wanders with x, like a chair back or a doorframe in shadow.
      const wobble = 22 * Math.sin(x / 61 + fig.seed) + 14 * Math.sin(x / 17);
      const occl = fig.cut < 1 ? Math.min(1, Math.max(0, (cutY + wobble - y) / 34)) : 1;
      // Contrast-stretch the noise so gaps open up inside the figure.
      const m = Math.min(1, Math.max(0, (nv - 0.36) * 2.4));
      const edge = Math.min(1, Math.min(x, W - 1 - x) / 40);
      const alpha = (px.data[i + 3] / 255) * m * bottom * occl * edge;
      const lum = Math.round(200 + 55 * nv);
      px.data[i] = lum;
      px.data[i + 1] = lum;
      px.data[i + 2] = lum;
      px.data[i + 3] = Math.round(Math.min(1, alpha * 1.5) * 255);
    }
  }
  o.putImageData(px, 0, 0);
  return out.toDataURL('image/png');
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  mkdirSync(outDir, { recursive: true });
  for (let k = 0; k < FIGURES.length; k++) {
    const dataUrl = await page.evaluate(drawMatte, FIGURES[k]);
    const file = join(outDir, `matte-${k + 1}.png`);
    writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`wrote ${file}`);
  }
} finally {
  await browser.close();
}
