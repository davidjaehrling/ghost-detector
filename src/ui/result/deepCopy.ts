import type { Placement } from '../../fx/ghostV0';
import { copyOf, t } from '../../i18n';

// Rewarded DEEP SCAN (P5-04). Copy is instrument voice: no claim of a real or truer reading, no
// system-style dialog. Strings that appear on the key live here so a test can assert them.
export const deepCopy = copyOf({
  legend: 'deep.legend',
  label: 'deep.label',
  arm: 'deep.arm',
  keyWarming: 'deep.keyWarming',
  keyOffline: 'deep.keyOffline',
  offline: 'deep.offline',
  warming: 'deep.warming',
  running: 'deep.running',
  done: 'deep.done',
  decoded: 'deep.decoded',
  evpHead: 'deep.evpHead',
});

// Short fragments for the EVP row, picked by the scan's seed. Simulated; the app says so in Settings.
const EVP_LINE_COUNT = 12; // locales keep exactly this many deep.evp.N keys

export function evpLine(seed: number): string {
  return t(`deep.evp.${(seed >>> 0) % EVP_LINE_COUNT}`);
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
