import { type FixtureName, isFixtureName } from './fixtureNames';

// Query overrides for the web harness. Production never sets them.
//   static=1       freeze jitter and animation (sticky for the page lifetime)
//   fixture=<name> photo shown on web and when the camera is unavailable (sticky)
//   speed=<n>      run the scan theatre n times faster (sticky)
//   phase=<n|hold> freeze the scan theatre at phase n (0 to 4) or the hold (this URL only)
export type Harness = { isStatic: boolean; fixture: FixtureName | null; speed: number; phase: number | 'hold' | null };

type Sticky = { isStatic: boolean; fixture: FixtureName | null; speed: number };
type Params = Record<string, string | string[] | undefined>;

const sticky: Sticky = { isStatic: false, fixture: null, speed: 1 };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parsePhase(v: string | undefined): number | 'hold' | null {
  if (v === 'hold') return 'hold';
  if (v === undefined || !/^[0-4]$/.test(v)) return null;
  return Number(v);
}

export function resolveHarness(params: Params, state: Sticky = sticky): Harness {
  if (first(params.static) === '1') state.isStatic = true;
  const fx = first(params.fixture);
  if (isFixtureName(fx)) state.fixture = fx;
  const sp = Number(first(params.speed));
  if (Number.isFinite(sp) && sp >= 1 && sp <= 100) state.speed = sp;
  return { ...state, phase: parsePhase(first(params.phase)) };
}

export function paramsFromSearch(search: string): Params {
  const out: Params = {};
  new URLSearchParams(search).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

// Web only; native has no location and gets the defaults.
export function readHarness(extra: Params = {}): Harness {
  const search = typeof window !== 'undefined' ? (window.location?.search ?? '') : '';
  return resolveHarness({ ...paramsFromSearch(search), ...extra });
}
