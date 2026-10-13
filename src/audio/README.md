# src/audio

Procedural sound and haptics. No sample files. Spec: `docs/sound-palette.md`. Tuning: `config.ts` only.

## Wiring (Builder A, P4-04)
```ts
const audio = createAudioEngine(resolveConfig(), { onNeedleTick: () => haptics.fire('needleTick') });
const haptics = createHaptics(cfg);
audio.setIntensity(i); audio.setTier(t); audio.start();   // viewfinder: hum, static, flux-driven clicks
audio.setFlux(mG);                                         // every reading
audio.scanPhase(0..4);  // on entering each timeline phase; 0 = relay click + haptics 'scanStart'
audio.fault();          // fault beat; audio.hold(); // at the hold; audio.reveal(); // end of hold
const w = scareWindow(cfg, scanMs); audio.scare();         // caller rolls eligibility, fires inside w
audio.stop(); audio.dispose();                             // leave screen / unmount
```
Import `./engine` and `./haptics` only; Metro picks `*.web.ts` on web (no-op plus `__audioLog()` / `__hapticLog()`).
Call order follows `src/ui/scan/timeline.ts`. `scanCues(cfg, ms, tier, intensity, fault)` lists expected cue times.

## What plays when
Viewfinder: hum + pink/white static at tier level, Poisson clicks at the tier rate scaled by distance from the running baseline, a click per 25 mG line. Scan: relay click, rate eases from QUIET to the tier rate by phase 3, key ticks at phases 1 and 2, breakthrough on phase 3 (STRONG/CRITICAL; Brave again at 4). Hold: `duckGain` to 0 in 15 ms. Reveal: 80 Hz thump, relay click, scene back over 600 ms, 3-click burst. Scare: noise + falling sine on a bus the hold cannot mute.

## Off switches
`haptics.setEnabled(false)`, `haptics.setReduced(true)` (4 ticks/s), `engine.setReduced(true)` (scare peak -12 dBFS), calm intensity (scare is a no-op, clicks capped at 6/s). Jump-scare ON/OFF and eligibility live with the caller.

## Unverified (native audio cannot run here)
- Everything in `engine.ts` against a real `AudioContext`; tests use a recording fake. Check click-to-ear latency (target under 40 ms), the -6 dBFS ceiling and the scare level on the P2 phone check.
- react-native-audio-api 0.13.6 has no `DynamicsCompressorNode` and no `latencyHint`: the limiter is a WaveShaper soft clip, so the scare is shaped, not compressed.
- Audio focus (transient duck), headphone route -6 dB scare, and silence when backgrounded are not implemented; they need `AudioManager` on device. The caller must `stop()` on app background.
- Tonal smear is gated by a fast random level, not by the noise itself.
- Dev build only: the module is native, so Expo Go cannot load it.
