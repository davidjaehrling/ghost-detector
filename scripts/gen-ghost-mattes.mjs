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
  { seed: 0x5eed0001, lean: 0.07, shoulder: [0.24, 0.14], headShift: 0.05, headTilt: -0.25, cut: 1.0, armL: 0.22, armR: 0.0 },
  { seed: 0x5eed0002, lean: -0.1, shoulder: [0.12, 0.22], headShift: -0.07, headTilt: 0.35, cut: 1.0, armL: 0.0, armR: 0.5 },
  { seed: 0x5eed0003, lean: 0.04, shoulder: [0.2, 0.17], headShift: 0.03, headTilt: 0.15, cut: 0.62, armL: 0.25, armR: 0.2 },
];

// Runs inside the page. Must stay self-contained.
function drawMatte(fig) {
  const ALPHA_EASE = 2.0;
  const EDGE_FEATHER_PX = 34;
  const EDGE_FEATHER_GAIN = 0.6;
  const INNER_FLOOR = 0.4;
  const HEAD_DENSITY = 0.72;
  const MAX_STRETCH = 1.3;
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
  blob(spineX(0.19) + W * fig.headShift * 0.5, H * 0.19, 34, 56, 0.26);
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

  // 3. Head-breaking noise: a second, finer field, used two ways in the head zone only. It warps
  // where the head samples the body (so the outline goes lumpy and lopsided) and bites gaps out
  // of it, so the head never reads as a round blob. Drawn after the body noise, so the rnd stream
  // for everything above is unchanged.
  const headNoise = make(W, H);
  const hn = headNoise.getContext('2d');
  hn.fillStyle = '#000';
  hn.fillRect(0, 0, W, H);
  for (const [gw, gh, weight, blurPx] of [
    [12, 24, 0.55, 18],
    [40, 80, 0.45, 6],
  ]) {
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
    hn.save();
    hn.globalAlpha = weight;
    hn.globalCompositeOperation = 'lighter';
    hn.filter = `blur(${blurPx}px)`;
    hn.drawImage(cell, -blurPx, -blurPx, W + blurPx * 2, H + blurPx * 2);
    hn.restore();
  }
  const hz = hn.getImageData(0, 0, W, H).data;
  const headEnd = H * 0.24;
  const headWeight = (y) => Math.min(1, Math.max(0, (headEnd - y) / (H * 0.08)));

  // 4. Composite: blur the body, warp the head, multiply alpha by the noise masks.
  // Noise may only open gaps near the silhouette edge, so every gap bites in from outside and
  // none sits enclosed in the head or torso (D-009: an enclosed dark hole reads as a face
  // cavity). `depth` is how far inside the body a pixel is, from the blurred body density.
  const out = make(W, H);
  const o = out.getContext('2d');
  o.filter = 'blur(14px)';
  o.drawImage(body, 0, 0);
  o.filter = 'none';
  const px = o.getImageData(0, 0, W, H);
  const src = Uint8ClampedArray.from(px.data);
  const nz = n.getImageData(0, 0, W, H).data;
  const bodySorted = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) bodySorted[k] = src[k * 4 + 3];
  bodySorted.sort();
  const bodyPeak = Math.max(1, bodySorted[Math.floor(bodySorted.length * 0.98)]);
  const smooth = (e0, e1, v) => {
    const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const cutY = fig.cut * H;
  const alphaOut = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    // Feathered vertical fade at the bottom, plus a soft occlusion edge for cut figures.
    const bottom = Math.min(1, Math.max(0, (H - 30 - y) / 160));
    const hw = headWeight(y);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const nv = nz[i] / 255;
      let bodyA = src[i + 3] / 255;
      const depth = smooth(0.3, 0.62, src[i + 3] / bodyPeak);
      if (hw > 0) {
        const hv = hz[i] / 255;
        const hv2 = hz[(y * W + ((x + 97) % W)) * 4] / 255;
        const sx = Math.min(W - 1, Math.max(0, Math.round(x + hw * (hv - 0.5) * 70)));
        const sy = Math.min(H - 1, Math.max(0, Math.round(y + hw * (hv2 - 0.5) * 50)));
        const warped = src[(sy * W + sx) * 4 + 3] / 255;
        // Bites only in the head's outer band; its core keeps at least 60%.
        const bite = Math.min(1, Math.max(0, (hv - 0.3) * 2.6));
        const headDepth = smooth(0.45, 0.85, (warped * 255) / bodyPeak);
        const biteKept = bite + (1 - bite) * 0.6 * headDepth;
        // The head is fainter than the torso, so it never pops out as a bright ball.
        bodyA = (bodyA * (1 - hw) + warped * hw) * (1 - hw + hw * biteKept) * (1 - hw * (1 - HEAD_DENSITY));
      }
      // Ragged occluder edge: the cut line wanders with x, like a chair back or a doorframe in shadow.
      const wobble = 22 * Math.sin(x / 61 + fig.seed) + 14 * Math.sin(x / 17);
      const occl = fig.cut < 1 ? Math.min(1, Math.max(0, (cutY + wobble - y) / 34)) : 1;
      // Contrast-stretched noise: full gaps at the edge, only density variation (floor
      // INNER_FLOOR)
      // deep inside.
      const m = Math.min(1, Math.max(0, (nv - 0.36) * 2.4));
      const mEff = m + (1 - m) * INNER_FLOOR * depth;
      const edge = Math.min(1, Math.min(x, W - 1 - x) / 40);
      alphaOut[y * W + x] = bodyA * mEff * bottom * occl * edge;
      const lum = Math.round(200 + 55 * nv);
      px.data[i] = lum;
      px.data[i + 1] = lum;
      px.data[i + 2] = lum;
    }
  }
  // 5. Normalise: the densest pixels reach full alpha, then an ease-out curve
  // (1 - (1 - a)^ALPHA_EASE) fills the drape (finite slope at 0, unlike a gamma, which would
  // harden the outline). The compositor's opacity is then the figure's real peak. The densest
  // 0.5% sets the scale, so the body keeps density variation instead of a flat plateau.
  // Edge feather: a wide blur of the same alpha, at reduced strength, is laid under it
  // (max), so the outer falloff runs over a wider band than the body's own soft edge and the
  // silhouette does not read as a cut-out.
  const sorted = Float32Array.from(alphaOut).sort();
  const peak = Math.max(1e-3, sorted[Math.floor(sorted.length * 0.995)]);
  const eased = new Float32Array(W * H);
  const sharp = make(W, H);
  const sc = sharp.getContext('2d');
  const simg = sc.createImageData(W, H);
  for (let k = 0; k < W * H; k++) {
    eased[k] = 1 - Math.pow(1 - Math.min(1, alphaOut[k] / peak), ALPHA_EASE);
    simg.data[k * 4] = 255;
    simg.data[k * 4 + 1] = 255;
    simg.data[k * 4 + 2] = 255;
    simg.data[k * 4 + 3] = Math.round(eased[k] * 255);
  }
  sc.putImageData(simg, 0, 0);
  const wide = make(W, H);
  const wc = wide.getContext('2d');
  wc.filter = `blur(${EDGE_FEATHER_PX}px)`;
  wc.drawImage(sharp, 0, 0);
  const wd = wc.getImageData(0, 0, W, H).data;
  for (let k = 0; k < W * H; k++) {
    const body = eased[k];
    const halo = EDGE_FEATHER_GAIN * (wd[k * 4 + 3] / 255);
    px.data[k * 4 + 3] = Math.round(Math.max(body, halo) * 255);
  }
  o.putImageData(px, 0, 0);

  // 6. Fill the box: crop to where the figure is, then stretch it back to 512 x 1024, at most
  // MAX_STRETCH per axis (more would read as a squashed body). The compositor places the PNG box,
  // so empty margins would only dilute the figure inside its own bounding box.
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (px.data[(y * W + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const cw = Math.max(W / MAX_STRETCH, x1 - x0 + 1);
  const ch = Math.max(H / MAX_STRETCH, y1 - y0 + 1);
  const cxm = (x0 + x1 + 1) / 2;
  const sx0 = Math.min(W - cw, Math.max(0, cxm - cw / 2));
  const sy0 = Math.min(H - ch, Math.max(0, y0));
  const fitted = make(W, H);
  const f = fitted.getContext('2d');
  f.imageSmoothingQuality = 'high';
  f.drawImage(out, sx0, sy0, cw, ch, 0, 0, W, H);
  return fitted.toDataURL('image/png');
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
