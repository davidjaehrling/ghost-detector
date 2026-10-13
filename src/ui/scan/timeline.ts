import { mulberry32 } from '../boot/seed';

// Scan theatre timeline (docs/sound-palette.md section 5). The scan runs for
// `durationMs` (outcome.scanDurationMs, 6 to 10 s). The last HOLD_MS is the
// silent hold; the phases share the time before it.

export const HOLD_MS = 1200;
export const PHASE_COUNT = 5;
export const TICK_MS = 100;
export const BAR_BLOCKS = 20;

export type Phase = 0 | 1 | 2 | 3 | 4;

// `t` is the elapsed time capped at the start of the hold: it stops there.
export type ScanFrame =
  | { kind: 'phase'; phase: Phase; activeFrac: number; progress: number; tick: number; t: number }
  | { kind: 'hold'; activeFrac: 1; progress: number; tick: number; t: number }
  | { kind: 'done'; activeFrac: 1; progress: number; tick: number; t: number };

export const activeMs = (durationMs: number) => Math.max(1, durationMs - HOLD_MS);

export function frameAt(elapsedMs: number, durationMs: number): ScanFrame {
  const active = activeMs(durationMs);
  const e = Math.max(0, elapsedMs);
  const capped = Math.min(e, active);
  const progress = capped / durationMs;
  const tick = Math.floor(capped / TICK_MS);
  if (e >= durationMs) return { kind: 'done', activeFrac: 1, progress, tick, t: capped };
  if (e >= active) return { kind: 'hold', activeFrac: 1, progress, tick, t: capped };
  const activeFrac = e / active;
  return { kind: 'phase', phase: Math.min(PHASE_COUNT - 1, Math.floor(activeFrac * PHASE_COUNT)) as Phase, activeFrac, progress, tick, t: capped };
}

// Elapsed time that harness `phase=<n>` freezes at: the middle of phase n, or
// the middle of the hold.
export function elapsedForPhase(phase: number | 'hold', durationMs: number): number {
  const active = activeMs(durationMs);
  if (phase === 'hold') return active + HOLD_MS / 2;
  return Math.round((active * (phase + 0.5)) / PHASE_COUNT);
}

// Ladder climbs with the scan, LED 1 (power) up to LED 4. LED 5 is for a CRITICAL result only.
export function scanLeds(frame: ScanFrame): number {
  return Math.min(4, 1 + Math.floor(frame.activeFrac * 4));
}

// Number of lit progress blocks (of BAR_BLOCKS).
export function barBlocks(progress: number): number {
  return Math.min(BAR_BLOCKS, Math.floor(progress * BAR_BLOCKS));
}

export const PHASE_LINES = [
  'Sweeping band 2.',
  'Sampling flux. Rate rising.',
  'Thermal pass. Reading gradient.',
  'Acoustic pass. Bands 1 to 4.',
  'Decoding signature. Reading blocks.',
] as const;

// Seeded readings for the value row. A pure function of (seed, phase, tick), so
// a frozen frame always shows the same numbers. Values step at 10 Hz.
export function readingAt(seed: number, phase: Phase, tick: number): string {
  const base = mulberry32((seed + phase * 7919) >>> 0);
  const b1 = base();
  const b2 = base();
  const noise = mulberry32((seed ^ Math.imul(tick + 1, 2654435761) ^ phase) >>> 0)();
  const wob = 1 + (noise - 0.5) * 0.04;
  switch (phase) {
    case 0:
      return `BAND 2  CH ${String(1 + Math.floor(((tick % 160) / 160) * 16)).padStart(2, ' ')}/16`;
    case 1:
      return `FLUX ${String(Math.round((300 + b1 * 260) * wob)).padStart(4, ' ')} mG`;
    case 2:
      return `dT ${(-(0.4 + b1 * 3.2) * wob).toFixed(1)} °C`;
    case 3:
      return `LVL ${Math.round(-(30 + b1 * 20) * wob)} dBFS  F ${Math.round((90 + b2 * 700) * wob)} Hz`;
    default:
      return `BLK ${String(Math.min(2048, Math.round(tick * 9.7 + b1 * 40))).padStart(4, '0')}/2048`;
  }
}

// Telemetry lines already shown before `phase`, newest last, at most `max`.
export function logBefore(phase: Phase, max = 3): string[] {
  return PHASE_LINES.slice(0, phase).slice(-max);
}
