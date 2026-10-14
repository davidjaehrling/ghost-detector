import type { Placement } from '../../fx/ghostV0';

// Rewarded DEEP SCAN (P5-04). Copy is instrument voice: no claim of a real or truer reading, no
// system-style dialog. Strings that appear on the key live here so a test can assert them.
export const deepCopy = {
  legend: 'DEEP SCAN',
  label: 'Deep scan',
  sub: 'SPONSORED VIDEO PLAYS FIRST',
  offline: 'DEEP SCAN OFFLINE. NO SIGNAL.',
  warming: 'DEEP SCAN WARMING. STAND BY.',
  running: 'DEEP SCAN RUNNING.',
  done: 'DEEP SCAN COMPLETE.',
  decoded: 'SIGNATURE DECODED: 100%',
  evpHead: 'EVP',
};

// Short fragments for the EVP row, picked by the scan's seed. Simulated; the app says so in Settings.
const EVP_LINES = [
  '"stay quiet"',
  '"behind the door"',
  '"who is counting"',
  '"not alone here"',
  '"cold hands"',
  '"it is late"',
  '"close the window"',
  '"still waiting"',
  '"under the stairs"',
  '"I heard you"',
  '"turn it off"',
  '"two of us"',
];

export function evpLine(seed: number): string {
  return EVP_LINES[(seed >>> 0) % EVP_LINES.length]!;
}

/** The apparition is drawn on a canvas this many times larger than the panel, then scaled down. */
export const HIRES_SCALE = 2;

const sp = (k: number) => (v: number) => v * k;

/** A placement in a panel `k` times larger (every pixel field scales; opacity, flip and alphas do not). */
export function scalePlacement(p: Placement, k: number): Placement {
  const f = sp(k);
  return {
    ...p,
    x: f(p.x),
    y: f(p.y),
    w: f(p.w),
    h: f(p.h),
    offsetCopies: p.offsetCopies.map((c) => ({ ...c, dx: f(c.dx), dy: f(c.dy) })),
    ...(p.echo ? { echo: { ...p.echo, dx: f(p.echo.dx), dy: f(p.echo.dy) } } : {}),
  };
}
