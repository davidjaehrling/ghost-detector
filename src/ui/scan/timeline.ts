import { mulberry32 } from '../boot/seed';

// Scan theatre timeline (docs/sound-palette.md section 5). The scan runs for
// `durationMs` (outcome.scanDurationMs, 6 to 10 s). The last HOLD_MS is the
// silent hold; the phases share the time before it.

export const HOLD_MS = 1200;
export const PHASE_COUNT = 5;
export const TICK_MS = 100;
export const BAR_BLOCKS = 20;

export type Phase = 0 | 1 | 2 | 3 | 4;

export const FAULT_MS = 1500;
export const FINAL_MS = 1500;
export const SWEEP_MS = 1600;
// The fault beat lands this far into the active time.
export const FAULT_AT = 0.55;

// `t` is the elapsed scan time capped at the start of the hold, with the fault
// beat taken out: it stops there. `sweep` is the sweep position in turns (the
// sweep runs twice as fast in the last FINAL_MS and freezes with `t`).
type Base = { progress: number; tick: number; t: number; sweep: number; final: boolean };
export type ScanFrame =
  | ({ kind: 'phase'; phase: Phase; activeFrac: number } & Base)
  | ({ kind: 'fault'; phase: Phase; activeFrac: number; faultT: number } & Base)
  | ({ kind: 'hold'; activeFrac: 1 } & Base)
  | ({ kind: 'done'; activeFrac: 1 } & Base);

export const activeMs = (durationMs: number) => Math.max(1, durationMs - HOLD_MS);
export const faultStartMs = (durationMs: number) => Math.round(activeMs(durationMs) * FAULT_AT);
export const totalMs = (durationMs: number, fault: boolean) => durationMs + (fault ? FAULT_MS : 0);

// About 1 scan in 15, seeded from the outcome seed (Bible section 6).
export function faultFor(seed: number): boolean {
  return mulberry32((seed ^ 0xfa17) >>> 0)() < 1 / 15;
}

function sweepTurns(t: number, active: number): number {
  const tf = Math.max(0, active - FINAL_MS);
  return t <= tf ? t / SWEEP_MS : tf / SWEEP_MS + (t - tf) / (SWEEP_MS / 2);
}

// `durationMs` is the outcome's scan duration; a fault beat adds FAULT_MS to it.
export function frameAt(elapsedMs: number, durationMs: number, fault = false): ScanFrame {
  const active = activeMs(durationMs);
  const e = Math.max(0, elapsedMs);
  let ee = e;
  let faultT = -1;
  if (fault) {
    const fs = faultStartMs(durationMs);
    if (e >= fs + FAULT_MS) ee = e - FAULT_MS;
    else if (e >= fs) {
      ee = fs;
      faultT = e - fs;
    }
  }
  const capped = Math.min(ee, active);
  const base: Base = {
    progress: capped / durationMs,
    tick: Math.floor(capped / TICK_MS),
    t: capped,
    sweep: sweepTurns(capped, active),
    final: ee >= active - FINAL_MS,
  };
  if (e >= totalMs(durationMs, fault)) return { kind: 'done', activeFrac: 1, ...base };
  if (ee >= active) return { kind: 'hold', activeFrac: 1, ...base };
  const activeFrac = ee / active;
  const phase = Math.min(PHASE_COUNT - 1, Math.floor(activeFrac * PHASE_COUNT)) as Phase;
  if (faultT >= 0) return { kind: 'fault', phase, activeFrac, faultT, ...base };
  return { kind: 'phase', phase, activeFrac, ...base };
}

// Elapsed time that harness `phase=<n>` freezes at: the middle of phase n, the
// middle of the hold, or just into the fault beat (the code is on).
export function elapsedForPhase(phase: number | 'hold' | 'fault', durationMs: number): number {
  const active = activeMs(durationMs);
  if (phase === 'fault') return faultStartMs(durationMs) + 100;
  if (phase === 'hold') return active + HOLD_MS / 2;
  return Math.round((active * (phase + 0.5)) / PHASE_COUNT);
}

// Fault code blinks at 2 Hz, 3 cycles over the beat: on for the first half of each 500 ms.
export const FAULT_LINE = 'E-07 SENSOR DRIFT. RECALIBRATING.';
export const faultOn = (faultT: number) => faultT % 500 < 250;

// Ladder climbs with the scan, LED 1 (power) up to LED 4. LED 5 is for a CRITICAL
// result only. On STRONG and CRITICAL, LED 4 goes dark for the hold: the result
// lights it (and LED 5) at the reveal.
export function scanLeds(frame: ScanFrame, tier?: string): number {
  const lit = Math.min(4, 1 + Math.floor(frame.activeFrac * 4));
  if (frame.kind === 'hold' && (tier === 'strong' || tier === 'critical')) return Math.min(lit, 3);
  return lit;
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

// Seeded live value for the big readout row (rdL). A pure function of (seed,
// phase, tick), so a frozen frame always shows the same numbers. Values step at 10 Hz.
export type Live = { label: string; value: string; unit: string };

export function liveAt(seed: number, phase: Phase, tick: number): Live {
  const base = mulberry32((seed + phase * 7919) >>> 0);
  const b1 = base();
  const noise = mulberry32((seed ^ Math.imul(tick + 1, 2654435761) ^ phase) >>> 0)();
  const wob = 1 + (noise - 0.5) * 0.04;
  switch (phase) {
    case 0:
      return { label: 'CH', value: String(1 + Math.floor(((tick % 160) / 160) * 16)), unit: '/16' };
    case 1:
      return { label: 'FLUX', value: String(Math.round((300 + b1 * 260) * wob)), unit: 'mG' };
    case 2:
      return { label: 'ΔT', value: (-(0.4 + b1 * 3.2) * wob).toFixed(1), unit: '°C' };
    case 3:
      return { label: 'LVL', value: String(Math.round(-(30 + b1 * 20) * wob)), unit: 'dBFS' };
    default:
      return { label: 'BLK', value: String(Math.min(2048, Math.round(tick * 9.7 + b1 * 40))).padStart(4, '0'), unit: '/2048' };
  }
}

export const readingAt = (seed: number, phase: Phase, tick: number): string => {
  const { label, value, unit } = liveAt(seed, phase, tick);
  return `${label} ${value} ${unit}`;
};

// Event rate in counts per second, climbing toward the intensity cap (Geiger
// caps from the voice guide: calm 6, standard 14, brave 22) as the scan runs.
export const RATE_CAP = { calm: 6, standard: 14, brave: 22 } as const;

export function rateAt(seed: number, tick: number, activeFrac: number, cap: number): number {
  const noise = mulberry32((seed ^ Math.imul(tick + 7, 2246822519)) >>> 0)();
  const level = (0.12 + 0.88 * activeFrac) * (1 + (noise - 0.5) * 0.12);
  return Math.max(1, Math.min(cap, Math.round(cap * level)));
}

// Telemetry lines already shown before `phase`, newest last, at most `max`.
export function logBefore(phase: Phase, max = 3): string[] {
  return PHASE_LINES.slice(0, phase).slice(-max);
}
