import { Skia, AlphaType, ColorType, type SkImage } from '@shopify/react-native-skia';
import type { RefObject } from 'react';
import type { View } from 'react-native';

// Web: Skia's makeImageFromView needs a caller-supplied rasteriser here. This one clones the
// view's DOM into an SVG <foreignObject>, carries the page's CSS rules (react-native-web keeps
// its styles in CSSOM, so they are serialised from cssRules) and inlines @font-face sources as
// data URLs (an SVG image cannot fetch fonts), draws it on a 2D canvas and hands the RGBA
// pixels to Skia. Limits: <canvas> children are copied with toDataURL, so a WebGL canvas
// without preserveDrawingBuffer comes out blank; cross-origin images and sheets are skipped.

let fontCss: Promise<string> | null = null;

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function inlineFontFace(rule: CSSFontFaceRule): Promise<string> {
  let css = rule.cssText;
  const urls = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]!).filter((u) => !u.startsWith('data:'));
  for (const u of urls) {
    try {
      const res = await fetch(new URL(u, document.baseURI).href);
      css = css.split(u).join(await toDataUrl(await res.blob()));
    } catch {
      // Leave the URL; the text falls back to the next family.
    }
  }
  return css;
}

function sheetsCss(): { rules: string; fonts: CSSFontFaceRule[] } {
  const out: string[] = [];
  const fonts: CSSFontFaceRule[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const r of Array.from(rules)) {
      if (r instanceof CSSFontFaceRule) fonts.push(r);
      else out.push(r.cssText);
    }
  }
  return { rules: out.join('\n'), fonts };
}

function cloneForSnapshot(node: HTMLElement): HTMLElement {
  const clone = node.cloneNode(true) as HTMLElement;
  const srcCanvases = node.querySelectorAll('canvas');
  const dstCanvases = clone.querySelectorAll('canvas');
  srcCanvases.forEach((c, i) => {
    const img = document.createElement('img');
    try {
      img.src = c.toDataURL();
    } catch {
      // Tainted canvas: leave a blank box.
    }
    img.style.cssText = c.style.cssText;
    img.width = c.clientWidth;
    img.height = c.clientHeight;
    dstCanvases[i]?.replaceWith(img);
  });
  clone.style.position = 'relative';
  clone.style.left = '0px';
  clone.style.top = '0px';
  clone.style.margin = '0px';
  clone.style.transform = 'none';
  return clone;
}

export async function snapshotView(ref: RefObject<View | null>): Promise<SkImage | null> {
  const node = ref.current as unknown as HTMLElement | null;
  if (!node || typeof document === 'undefined') return null;
  const w = Math.ceil(node.offsetWidth);
  const h = Math.ceil(node.offsetHeight);
  if (w <= 0 || h <= 0) return null;
  const { rules, fonts } = sheetsCss();
  fontCss ??= Promise.all(fonts.map(inlineFontFace)).then((f) => f.join('\n'));
  const inherited = getComputedStyle(node.parentElement ?? node);
  const host = document.createElement('div');
  host.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  host.style.cssText = `width:${w}px;height:${h}px;overflow:hidden;font-family:${inherited.fontFamily};color:${inherited.color};`;
  const style = document.createElement('style');
  style.textContent = `${await fontCss}\n${rules}`;
  host.appendChild(style);
  host.appendChild(cloneForSnapshot(node));
  const xhtml = new XMLSerializer().serializeToString(host);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const dpr = window.devicePixelRatio || 1;
  const cw = Math.round(w * dpr);
  const ch = Math.round(h * dpr);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, cw, ch).data;
  return Skia.Image.MakeImage(
    { width: cw, height: ch, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul },
    Skia.Data.fromBytes(new Uint8Array(px.buffer, px.byteOffset, px.byteLength)),
    cw * 4,
  );
}
