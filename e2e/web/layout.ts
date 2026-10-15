import type { Page } from '@playwright/test';

// Layout sweeps shared by i18n-layout.spec.ts and fontscale.spec.ts.

/** Text that is clipped, ellipsised or outside the screen, as `testid: text (why)` lines. */
export async function overflows(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    const label = (e: Element) => `${e.closest('[data-testid]')?.getAttribute('data-testid') ?? e.tagName}: ${(e.textContent ?? '').trim().slice(0, 48)}`;
    if (document.documentElement.scrollWidth > vw) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
    for (const e of Array.from(document.querySelectorAll('body *'))) {
      if (!Array.from(e.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')) continue;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const box = e.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      // The ink: each own text node up to its last visible character (readout cells are padded with spaces).
      const ink = document.createRange();
      let first = true;
      for (const n of Array.from(e.childNodes)) {
        if (n.nodeType !== 3 || (n.textContent ?? '').trim() === '') continue;
        const txt = n.textContent ?? '';
        const lead = txt.length - txt.trimStart().length;
        if (first) ink.setStart(n, lead);
        ink.setEnd(n, txt.trimEnd().length);
        first = false;
      }
      const r = ink.getBoundingClientRect();
      // Sideways extent of the visible words only: a space that hangs past a wrapped line's end is not ink.
      let left = Infinity;
      let right = -Infinity;
      for (const n of Array.from(e.childNodes)) {
        if (n.nodeType !== 3) continue;
        for (const m of (n.textContent ?? '').matchAll(/\S+/g)) {
          const w = document.createRange();
          w.setStart(n, m.index ?? 0);
          w.setEnd(n, (m.index ?? 0) + m[0].length);
          const q = w.getBoundingClientRect();
          left = Math.min(left, q.left);
          right = Math.max(right, q.right);
        }
      }
      if (!Number.isFinite(left)) {
        left = r.left;
        right = r.right;
      }
      // A glyph box is taller than its line box in VT323; a quarter of the font size is not a cut.
      const slack = Math.max(1, parseFloat(cs.fontSize) * 0.25);
      if (right > vw + 0.5 || left < -0.5) out.push(`${label(e)} (off screen ${Math.round(left)}..${Math.round(right)} of ${vw})`);
      if (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) out.push(`${label(e)} (ellipsis ${e.scrollWidth} > ${e.clientWidth})`);
      for (let a: Element | null = e; a && a !== document.body; a = a.parentElement) {
        const ac = getComputedStyle(a);
        const ab = a.getBoundingClientRect();
        if (ac.overflowX === 'hidden' || ac.overflowX === 'clip') {
          if (right > ab.right + 1 || left < ab.left - 1) out.push(`${label(e)} (clipped sideways by ${a.getAttribute('data-testid') ?? a.tagName})`);
        }
        if (ac.overflowY === 'hidden' || ac.overflowY === 'clip') {
          if (ab.height <= 120 && (r.bottom > ab.bottom + slack || r.top < ab.top - slack)) out.push(`${label(e)} (clipped vertically by ${a.getAttribute('data-testid') ?? a.tagName})`);
        }
      }
    }
    return [...new Set(out)];
  });
}

/** Lines used by the text of each hardware key legend, by distinct rect tops. */
export async function legendLines(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const res: Record<string, number> = {};
    for (const k of Array.from(document.querySelectorAll('[data-testid^="key-"]'))) {
      const r = document.createRange();
      r.selectNodeContents(k);
      const tops = new Set(Array.from(r.getClientRects()).filter((q) => q.width > 0).map((q) => Math.round(q.top / 4)));
      // No word is broken across lines: every word of the legend has all its rects on one line.
      const walker = document.createTreeWalker(k, NodeFilter.SHOW_TEXT);
      let broken = 0;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const txt = n.textContent ?? '';
        for (const m of txt.matchAll(/\S+/g)) {
          const w = document.createRange();
          w.setStart(n, m.index ?? 0);
          w.setEnd(n, (m.index ?? 0) + m[0].length);
          if (new Set(Array.from(w.getClientRects()).filter((q) => q.width > 0).map((q) => Math.round(q.top / 4))).size > 1) broken++;
        }
      }
      res[`${k.getAttribute('data-testid')}:${(k.textContent ?? '').trim()}`] = tops.size + (broken > 0 ? 100 : 0);
    }
    return res;
  });
}

/** Words that render across two lines (`COMPORTAMEN / TO`), on any visible text of the screen. */
export async function brokenWords(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const txt = n.textContent ?? '';
      for (const m of txt.matchAll(/\S+/g)) {
        const w = document.createRange();
        w.setStart(n, m.index ?? 0);
        w.setEnd(n, (m.index ?? 0) + m[0].length);
        const tops = new Set(Array.from(w.getClientRects()).filter((q) => q.width > 0).map((q) => Math.round(q.top / 4)));
        if (tops.size > 1) out.push(`${el.closest('[data-testid]')?.getAttribute('data-testid') ?? el.tagName}: ${m[0]}`);
      }
    }
    return [...new Set(out)];
  });
}

/** The entity card: one label column, every value or bar starts at the same x, no label runs into it. */
export async function profileColumns(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const card = document.querySelector('[data-testid="result-profile"]');
    if (!card) return [];
    const out: string[] = [];
    const rows = Array.from(card.children).filter((c) => c.children.length === 2);
    const starts: number[] = [];
    for (const row of rows) {
      const label = row.children[0]!;
      const value = row.children[1]!;
      const r = document.createRange();
      r.selectNodeContents(label);
      const ink = r.getBoundingClientRect();
      const v = value.getBoundingClientRect();
      starts.push(v.left);
      if (ink.right > v.left + 0.5) out.push(`label ${(label.textContent ?? '').trim()} ends at ${Math.round(ink.right)}, value starts at ${Math.round(v.left)}`);
      if (new Set(Array.from(r.getClientRects()).filter((q) => q.width > 0).map((q) => Math.round(q.top / 4))).size > 1) out.push(`label ${(label.textContent ?? '').trim()} wraps`);
    }
    if (starts.length > 0 && Math.max(...starts) - Math.min(...starts) > 0.5) out.push(`value column not aligned: ${starts.map(Math.round).join(', ')}`);
    return out;
  });
}
