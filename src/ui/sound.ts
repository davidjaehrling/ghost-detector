import type { Intensity, Tier } from '../audio/config';
import type { Haptics } from '../audio/haptics';
import type { ScanPhase } from '../audio/scheduler';
import type { AudioEngine } from '../audio/types';
import type { SettingsSnapshot } from '../state/settings';

// Sound and haptics behind the settings switches (P4-04). Pure: the engine, haptics, settings and
// intensity come in as functions, so Vitest runs it with fakes. src/ui/audio.ts holds the app's
// instance. Every call is a no-op while its switch is off, so a muted run never reaches the engine.

type HapticsLike = Pick<Haptics, 'fire' | 'setEnabled' | 'setReduced' | 'setIntensity'>;
type EngineLike = Pick<AudioEngine, 'start' | 'stop' | 'setTier' | 'setIntensity' | 'setFlux' | 'scanPhase' | 'hold' | 'reveal' | 'scare' | 'fault' | 'setReduced'>;

export interface Sound {
  /** Start the scene for `owner` (the viewfinder). Running under the same owner: nothing; under another: a fresh start. */
  start(owner: string, tier?: Tier): void;
  /** Take over a running scene for `owner` without restarting it (the scan after the viewfinder), or start it. */
  join(owner: string, tier?: Tier): void;
  /** Fade out and suspend; no call at all when nothing is running. With an owner, only if it still owns the scene (a screen losing focus must not stop the one that replaced it). */
  stop(owner?: string): void;
  setTier(tier: Tier): void;
  /** Live flux in mG, viewfinder. */
  setFlux(mg: number): void;
  /** Scan begins: the start haptic. The relay click is the engine's scanPhase(0). */
  scanStart(): void;
  scanPhase(phase: ScanPhase): void;
  fault(): void;
  hold(): void;
  /** The number lands. `tier` picks the haptic. */
  reveal(tier?: Tier): void;
  /** Jump-scare burst now; the caller has rolled eligibility. */
  scare(): void;
  capture(): void;
  /** OS reduced motion: reduced scare peak and fewer needle ticks. */
  setReducedMotion(on: boolean): void;
}

export function createSound(deps: {
  engine: () => EngineLike;
  haptics: () => HapticsLike;
  settings: () => Pick<SettingsSnapshot, 'sound' | 'haptics'>;
  intensity: () => Intensity;
  /** Called with each cue name as it is forwarded (harness log). */
  onCue?: (cue: string) => void;
}): Sound {
  let running = false;
  let owner: string | null = null;
  let reduced = false;
  const cue = (c: string) => deps.onCue?.(c);
  const withEngine = (c: string, fn: (e: EngineLike) => void) => {
    if (!deps.settings().sound) return;
    cue(c);
    fn(deps.engine());
  };
  const buzz = (c: string, event: Parameters<HapticsLike['fire']>[0]) => {
    if (!deps.settings().haptics) return;
    cue(c);
    deps.haptics().fire(event);
  };
  const sync = () => {
    const i = deps.intensity();
    const h = deps.haptics();
    h.setEnabled(deps.settings().haptics);
    h.setIntensity(i);
    h.setReduced(reduced);
    return i;
  };

  const begin = (who: string, tier?: Tier) => {
    running = true;
    owner = who;
    const i = sync();
    cue('start');
    const e = deps.engine();
    e.setIntensity(i);
    e.setReduced(reduced);
    if (tier) e.setTier(tier);
    e.start();
  };
  const end = () => {
    running = false;
    owner = null;
    cue('stop');
    deps.engine().stop();
  };

  return {
    start(who, tier) {
      if (!deps.settings().sound) return;
      if (running && owner === who) return;
      if (running) end();
      begin(who, tier);
    },
    join(who, tier) {
      if (!deps.settings().sound) return;
      if (!running) return begin(who, tier);
      owner = who;
      if (tier) deps.engine().setTier(tier);
    },
    stop(who) {
      if (!running || (who !== undefined && who !== owner)) return;
      end();
    },
    setTier: (tier) => running && withEngine('setTier', (e) => e.setTier(tier)),
    setFlux: (mg) => running && deps.settings().sound && deps.engine().setFlux(mg),
    scanStart() {
      sync();
      buzz('scanStart', 'scanStart');
    },
    scanPhase: (phase) => running && withEngine(`scanPhase ${phase}`, (e) => e.scanPhase(phase)),
    // No haptic: the Bible's fault codes are on screen and in the static, not in the hand.
    fault: () => running && withEngine('fault', (e) => e.fault()),
    hold: () => running && withEngine('hold', (e) => e.hold()),
    reveal(tier) {
      if (running) withEngine('reveal', (e) => e.reveal());
      // CRITICAL replaces the scan-end tap with the warning pattern (sound palette section 7).
      buzz(tier === 'critical' ? 'hapticCritical' : 'hapticScanEnd', tier === 'critical' ? 'criticalResult' : 'scanEnd');
    },
    scare() {
      withEngine('scare', (e) => e.scare());
      buzz('hapticScare', 'scare');
    },
    capture() {
      sync();
      buzz('hapticCapture', 'capture');
    },
    setReducedMotion(on) {
      reduced = on;
      if (running) deps.engine().setReduced(on);
      deps.haptics().setReduced(on);
    },
  };
}

