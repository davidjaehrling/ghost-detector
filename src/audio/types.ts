import type { Intensity, Tier } from './config';
import type { ScanPhase } from './scheduler';

export interface AudioEngine {
  /** Create the context (first call) and fade the scene in over 400 ms. */
  start(): void;
  /** Fade out and suspend. Safe to call twice. */
  stop(): void;
  setTier(tier: Tier): void;
  setIntensity(intensity: Intensity): void;
  /** Live flux reading in mG (viewfinder). Drives the click rate and graticule ticks. */
  setFlux(mG: number): void;
  /** Call on entering each scan phase (0 starts the scan: relay click, rate ramp from QUIET). */
  scanPhase(phase: ScanPhase): void;
  /** Cut to silence for the hold (scare bus is not muted). */
  hold(): void;
  /** End of the hold: thump, relay click, scene returns over 600 ms, 3-click overshoot burst. */
  reveal(): void;
  /** One scare burst now. The caller owns eligibility and timing (scareWindow). No-op on calm. */
  scare(): void;
  /** Fault-code scan: 250 ms static dropout. */
  fault(): void;
  /** Reduced-flash mode: scare peak drops to the reduced level. */
  setReduced(on: boolean): void;
  dispose(): void;
}

export interface EngineHooks {
  /** Fired when the needle crosses a graticule line, so the screen can fire the needle-tick haptic. */
  onNeedleTick?: () => void;
}

export interface AudioLogEntry {
  /** ms since the engine was created. */
  t: number;
  call: string;
  args: unknown[];
}
