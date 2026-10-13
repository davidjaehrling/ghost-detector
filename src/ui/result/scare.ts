import { resolveConfig } from '../../audio/config';

// Jump-scare visual (psych brief section 3, sound palette section 6, WCAG 2.3.1): a 500 ms
// sequence at the reveal of a CRITICAL result. Two full-glass p5 flashes of 70 ms at t = 0 and
// t = 260 ms (2 in any second, under the limit of 3), and in the first frame of the first flash
// the apparition pops at its matte's full opacity, then drops back. The timing is the audio
// config's (one table for the cue and the picture); the engine and the history already enforce
// who gets a scare (first 3 scans, 24 h, per session).

const cfg = resolveConfig().scare;

export const SCARE = {
  totalMs: cfg.durationMs,
  flashAtMs: [...cfg.flashAtMs],
  flashMs: cfg.flashMs,
  /** One frame at 60 Hz. */
  popMs: 17,
  /** Flash strength: the glass fills with p5 at this opacity. */
  flashOpacity: 0.8,
  /** The pop frame is a lighter flash so the figure shows through it. */
  popFlashOpacity: 0.3,
  /** At most this many flashes in any 1 s (the brief says 2; WCAG's ceiling is 3). */
  maxPerSecond: 2,
} as const;

export type ScareFrame = {
  /** p5 flash opacity over the glass, 0 when off. */
  flash: number;
  /** The apparition is at full opacity this frame. */
  pop: boolean;
  /** The sequence is over. */
  done: boolean;
};

export const REST: ScareFrame = { flash: 0, pop: false, done: false };
export const DONE: ScareFrame = { flash: 0, pop: false, done: true };

// The picture at `tMs` after the sequence starts.
export function scareFrame(tMs: number): ScareFrame {
  if (tMs < 0) return REST;
  if (tMs >= SCARE.totalMs) return DONE;
  const onFlash = SCARE.flashAtMs.some((at) => tMs >= at && tMs < at + SCARE.flashMs);
  const pop = tMs >= SCARE.flashAtMs[0]! && tMs < SCARE.flashAtMs[0]! + SCARE.popMs;
  return { flash: !onFlash ? 0 : pop ? SCARE.popFlashOpacity : SCARE.flashOpacity, pop, done: false };
}

// ---------- frame-safe playback ----------

// The sequence as segments, each starting at `at` ms and holding one picture until the next.
const edges = [...new Set([0, SCARE.popMs, ...SCARE.flashAtMs, ...SCARE.flashAtMs.map((a) => a + SCARE.flashMs), SCARE.totalMs])].sort((a, b) => a - b);
export const SEGMENTS: readonly { at: number; frame: ScareFrame }[] = edges.map((at) => ({ at, frame: scareFrame(at) }));

// Which segment to show on this display frame. Each picture is held for at least one painted
// frame, so a slow device shows every flash (a late frame stretches the sequence, never skips
// one); on a 60 Hz screen it follows the clock to within a frame.
export function nextSegment(index: number, elapsedMs: number, paintedFrames: number): number {
  const last = SEGMENTS.length - 1;
  if (index >= last) return last;
  return paintedFrames >= 1 && elapsedMs >= SEGMENTS[index + 1]!.at ? index + 1 : index;
}

// The frame golden tests and the static harness show: the pop.
export const PEAK_FRAME: ScareFrame = scareFrame(SCARE.flashAtMs[0]!);

// Most flash starts inside any window of `windowMs`.
export function maxFlashesIn(startsMs: readonly number[], windowMs = 1000): number {
  let best = 0;
  for (const a of startsMs) best = Math.max(best, startsMs.filter((b) => b >= a && b < a + windowMs).length);
  return best;
}

// The visual plays only when the outcome carries the flag, the Settings switch is on and the OS
// asks for no reduced motion (Bible section 7, sound palette section 8: the flash is removed).
export function scareEligible({ jumpScare, enabled, reduceMotion }: { jumpScare: boolean; enabled: boolean; reduceMotion: boolean }): boolean {
  return jumpScare && enabled && !reduceMotion;
}
