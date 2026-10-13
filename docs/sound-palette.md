# Sound palette and haptic grammar

Owner: Sound & Haptics · P1-05 · 2026-10-13. Inputs: plan §6 and §9, research digest §5, `docs/psych-brief.md` §2.3 and §3. Everything is generated in code. No sample files ship, so `assets/LICENSES.md` gets no audio rows. Numbers are starting values for Dr. Hollow to tune through the config in §9.

## 1. Audio graph

Library: `react-native-audio-api` (Web Audio API shape) in the dev build. One `AudioContext` at 48000 Hz, `latencyHint: 'interactive'`. Target: click scheduled to audible under 40 ms on a mid-range Android phone; measure on the P2 phone check.

```
geigerBus (gain) --------\
humBus    (gain) ---------+--> sceneMix --> duckGain --> limiter --> master (ceiling) --> destination
staticBus (gain) --------/                                ^
scareBus  (gain) -----------------------------------------+ (bypasses duckGain)
```

- Geiger: one pre-rendered 3 ms noise buffer per variant (4 variants), played through `AudioBufferSourceNode`s with per-click gain and playback-rate scatter. Clicks are scheduled 100 ms ahead on the audio clock, not on JS timers.
- Hum: 4 oscillators (fundamental plus harmonics) into per-partial gains.
- Static: a looping 2 s white or pink noise buffer, a band-pass `BiquadFilterNode`, and a slow LFO on the gain.
- Scare: a one-shot noise burst plus a falling sine, with its own bus so the silent hold cannot mute it.
- Limiter: `DynamicsCompressorNode`, threshold -9 dBFS, ratio 20, attack 1 ms, release 80 ms, so the hard ceiling is -6 dBFS sample peak. `duckGain` is how the scan theatre drops the scene to zero for the 1.2 s hold.

Levels (peak dBFS, before the limiter):

| Bus | Floor | Typical | Max |
|---|---|---|---|
| Geiger click | -30 | -22 | -12 |
| Hum | -48 | -38 | -26 |
| Static | -54 | -36 | -18 |
| Scare | n/a | -8 | -6 |

Master ceiling: -6 dBFS sample peak at default, user volume slider capped to that value. Everything else is quieter, so the scare is the only event that touches the ceiling.

Web (L2 harness): `src/audio/index.web.ts` exports the same functions and does nothing. It logs each call to an in-memory array (`__audioLog`) so Playwright can assert that a scan fired the expected cues without needing an audio device. No `AudioContext` is created on web, which avoids the autoplay-policy warning.

## 2. Geiger

Click: a noise burst of 1 to 3 ms (random per click, weighted to 1.5 ms), band-limited 1.5 to 6 kHz. Envelope: 0.2 ms linear attack, exponential decay to -60 dB over the burst length. Gain scatter of ±3 dB and playback-rate scatter of ±12% so no two clicks match. Inter-click times are exponential: `dt = -ln(U) / rate`, with a 12 ms refractory floor so two clicks never fuse.

Mean rate (clicks per second) by tier and intensity, with the wobble applied to the rate itself (a slow random walk, 0.4 Hz, ±percent of mean):

| Tier | Calm | Standard | Brave | Wobble |
|---|---|---|---|---|
| QUIET | 0.5 | 0.8 | 1.0 | ±40% |
| TRACE | 1.5 | 2.5 | 3.5 | ±30% |
| ACTIVE | 3 | 6 | 9 | ±20% |
| STRONG | 5 | 10 | 16 | ±15% |
| CRITICAL | 6 | 14 | 22 | ±10% |

The CRITICAL row equals the psych-brief caps (6, 14, 22 clicks/s). Rates ramp from the QUIET value to the result tier's value over the scan (see §5), so the number is hinted but not given away early.

Link to the needle: in the viewfinder the rate follows the live reading, `rate = base * (1 + k * max(0, |B - B0|) / span)`, where `B0` is the running baseline in mG. A click is also fired on every needle tick that crosses a 25 mG graticule line, so the eye and ear agree. The needle's overshoot adds a short burst of 3 extra clicks at 2x rate. Calm clamps the output to 6 clicks/s at any input.

## 3. Hum

Default fundamental by locale: 50 Hz for most regions, 60 Hz for the Americas, South Korea, Taiwan and parts of Japan. A Settings override is allowed.

| Partial | Frequency | Level vs fundamental |
|---|---|---|
| 1 | f0 | 0 dB |
| 2 | 2 f0 | -6 dB |
| 3 | 3 f0 | -10 dB |
| 5 | 5 f0 | -16 dB |

Phone speakers cannot reproduce 50 Hz, so the harmonics at 100 and 150 Hz carry the perceived hum; the fundamental stays in for headphones. Amplitude drift: a 0.07 Hz sine plus a 0.9 Hz tremolo of ±1.5 dB, with a random phase at each start. Slight detune of partial 3 by +0.3 Hz gives a slow beat.

Scaling with the reading: bus level runs from -48 dBFS at QUIET to -26 dBFS at CRITICAL, linear in dB across the 0 to 100 score. In the viewfinder it follows the needle with a 250 ms time constant. A low-pass opens from 400 Hz to 2 kHz as the score rises, so the hum gets brighter and harsher.

## 4. Static

Noise: pink noise for QUIET to ACTIVE (less hiss, more body); white noise for STRONG and CRITICAL. Band-pass filter:

| Tier | Level (dBFS) | Centre | Q |
|---|---|---|---|
| QUIET | -54 | 1800 Hz | 0.7 |
| TRACE | -46 | 2200 Hz | 0.8 |
| ACTIVE | -38 | 2600 Hz | 1.0 |
| STRONG | -28 | 3000 Hz | 1.4 |
| CRITICAL | -22 | 3400 Hz | 1.8 |

A 0.3 to 1.1 Hz random LFO moves the centre by ±15% so the static drifts like a badly tuned receiver.

Signal breaking through (STRONG and CRITICAL only): at 55% of scan progress, the Q drops to 0.5 and the level rises 6 dB for 250 ms (the static opens), then collapses to a Q of 6 at 1.2 kHz for 400 ms. A faint 2 to 4 s tonal smear (two detuned sines, 300 and 310 Hz, -34 dBFS, amplitude-gated by the noise) sits inside that narrow band, as if a voice fell out of the noise. It carries no words. Brave adds a second pass at 80%. CRITICAL uses level +4 dB over STRONG.

## 5. Scan theatre timeline

Base scan T = 6.0 to 8.0 s (psych brief §2.4); STRONG and CRITICAL add 1.0 to 2.0 s. Times below are for T = 8.0 s; positions scale as a fraction of T, except the hold, which is always 1.2 s.

| Time | Progress | Audio | Haptic |
|---|---|---|---|
| 0.0 s | 0% | Scan-start relay click; hum jumps to the tier's floor; Geiger at QUIET rate | scan start |
| 0.0 to 4.0 s | 0 to 50% | Geiger ramps toward the tier rate (ease-in); static rises one tier step; hum gets brighter | needle tick on each graticule crossing |
| 2.0 s, 4.0 s | 25%, 50% | Telemetry line appears with a soft key tick (-30 dBFS, 8 ms) | none |
| 4.4 s | 55% | Signal breaking through (STRONG and CRITICAL only, §4) | none |
| 4.0 to 6.8 s | 50 to 85% | Geiger reaches the tier rate; the rate wobble tightens | needle ticks continue |
| 5.6 to 6.2 s | 70 to 77% | CRITICAL only, jump-scare window if the roll succeeded (§6) | scare burst |
| 6.8 s | 85% | Cut to silence: `duckGain` to 0 in 15 ms, hum and static off, Geiger stops. Hold 1.2 s | none |
| 8.0 s | 100% | The number lands: one 12 ms thump (80 Hz, -14 dBFS) and a single relay click, then hum and static return at the tier floor over 600 ms | scan end |
| 8.0 to 8.9 s | n/a | Needle overshoot settles; a Geiger burst of 3 clicks at 2x rate | tier change if the tier differs from the viewfinder tier |

Fault-code scans (plan 1 in 15) add 1.5 s before the hold; the ramp stretches, and a one-off dropout of 250 ms in the static plays at the E-07 line. The hold never shortens. Result screens play only the hum at the tier floor; no ad plays over the reveal (psych brief §2.6).

## 6. Jump-scare envelope

Eligibility is exactly the psych-brief rule: CRITICAL result only, Standard 25% and Brave 50% given CRITICAL, never in the first 3 scans of the install, at most 1 per 24 h (Standard) or 1 per session (Brave). Total duration 500 ms (range 400 to 600 ms; the config clamps to that range).

Audio, on `scareBus` so the silent hold cannot mute it:
- Attack 8 ms linear to peak, hold 90 ms, then exponential decay to -40 dB at 500 ms.
- Peak: -6 dBFS sample peak, set by the limiter ceiling.
- Spectrum: a white noise burst high-passed at 600 Hz (hiss, 2 to 8 kHz weighted) summed with a sine that falls from 900 Hz to 140 Hz in 350 ms at -12 dB relative to the noise. Slight bit-crush (8 bits) on the noise for grit. No tonal chord, no voice, no scream.
- Start window: from 0.70 T to the earlier of 0.90 T and (T minus 1.2 s hold minus 0.15 s minus the scare duration). In an 8.0 s scan that is 5.6 to 6.2 s. After it ends there is 150 ms of silence before the hold begins.

Visual flash cadence (owned by FX, set here): at most 2 flashes inside the 500 ms window, at t = 0 and t = 260 ms, each 70 ms on. That is 2 flashes in any 1 s, under the limit of 3 (WCAG 2.3.1). The flash is a distorted full-frame figure at phosphor white, never saturated red, never covering more than the dim figure's silhouette plus the static burst.

Haptic burst: one `Heavy` impact at t = 0 and one `Rigid` at t = 80 ms (total 90 ms). No sustained buzz.

Off switch: Settings "Jump-scares: ON/OFF". When OFF, a CRITICAL result still plays the normal STRONG breakthrough and the same visual tier, but the scare window is skipped. Calm rule: the toggle is locked to OFF on Calm and the probability is 0; a Calm user who flips the toggle sees it return to OFF with a line in the instrument voice ("CALM MODE. SCARE CIRCUIT DISABLED."). The result-screen "Too much? Set CALM." slider takes effect on the next scan.

## 7. Haptic grammar

`expo-haptics` only. Every pattern is under 120 ms and made of discrete transients; there is no long buzz. Android may merge fast calls, so gaps are 40 ms or more.

| Event | Pattern | Count | Spacing | Total |
|---|---|---|---|---|
| Needle tick | `impactAsync(Light)` | 1 | n/a | about 10 ms; max 8 per second, dropped when the Geiger rate is above 12/s |
| Tier change (up) | `impactAsync(Medium)` | 1 | n/a | about 15 ms |
| Tier change (down) | `impactAsync(Light)` | 1 | n/a | about 10 ms |
| Capture | `impactAsync(Rigid)` | 1 | n/a | about 12 ms, aligned to the shutter sound |
| Scan start | `impactAsync(Medium)` then `Light` | 2 | 60 ms | about 85 ms |
| Scan end | `impactAsync(Heavy)` | 1 | n/a | about 20 ms, aligned to the thump (§5) |
| CRITICAL result | `notificationAsync(Warning)` | 1 | n/a | about 60 ms; replaces scan end when the tier is CRITICAL |
| UI confirm | `selectionAsync()` | 1 | n/a | about 8 ms |
| Error | `notificationAsync(Error)` | 1 | n/a | about 80 ms |

Rules: events fire only from a reading or a user action, never at random. The Android vibration setting and a Settings "Haptics" toggle both gate every call. Calm drops Heavy to Medium and Rigid to Light.

## 8. Accessibility and safety

- Reduced-motion and flash mode: follows the OS reduce-motion setting and a Settings switch. It removes the scare flash entirely (the audio burst is kept only if jump-scares are ON, at -12 dBFS peak), replaces the sweep ripple with a fade, and caps the needle tick haptic at 4 per second.
- Volume ceiling: the master peak is -6 dBFS. The app reads no system volume and never raises it. The first scan of a session fades the scene in over 400 ms so a loud media level does not startle.
- Audio focus: request transient focus with duck, release at scan end, so music and calls are not cut hard. The app plays nothing when the screen is off or the app is backgrounded.
- Headphones: if a route change to headphones occurs mid-scan, the scare level drops 6 dB for that scan.
- No system imitation: no cue uses the stock Android notification, ringtone, alarm, charging, low-battery or camera-shutter tones, and none has the shape of one (a two-tone chime, a rising triple beep, a repeated ping). The relay click, the thump and the noise burst are the only discrete cues. This follows the psych brief rule that sounds never mimic an Android dialog, call or alert.
- Captions: each cue has a line in the telemetry strip, so a deaf or muted user reads the same sequence.

## 9. Config sketch

Lives at `src/audio/config.ts`; the audio code reads it and has no literals of its own.

```ts
type Tier = 'QUIET' | 'TRACE' | 'ACTIVE' | 'STRONG' | 'CRITICAL';
type Intensity = 'calm' | 'standard' | 'brave';
export interface SoundConfig {
  sampleRate: 48000;
  masterCeilingDbfs: number;                 // -6, hard limit
  geiger: {
    ratePerSec: Record<Tier, Record<Intensity, number>>;
    wobblePct: Record<Tier, number>;
    clickMs: [min: number, max: number];     // 1..3
    refractoryMs: number;                    // 12
    levelDbfs: [floor: number, max: number];
  };
  hum: { f0ByRegion: Record<string, 50 | 60>; harmonicsDb: number[]; driftHz: number; levelDbfs: [min: number, max: number] };
  static: { levelDbfs: Record<Tier, number>; centreHz: Record<Tier, number>; q: Record<Tier, number> };
  breakthrough: { atProgress: number; narrowHz: number; narrowQ: number; durationMs: number };
  scare: { durationMs: number; peakDbfs: number; flashAtMs: number[]; windowStart: number; windowEnd: number };
  holdMs: number;                            // 1200, not below 1000
  haptics: Record<string, { kind: 'impact' | 'notification' | 'selection'; style?: string; count: number; gapMs: number }>;
  accessibility: { reducedFlash: boolean; maxTicksPerSec: number };
}
```

The config loader clamps `scare.durationMs` to 400 to 600, `scare.peakDbfs` to at most -6, `flashAtMs.length` to at most 3 per second, and every haptic pattern to 120 ms, so a tuning change cannot break the psych-brief limits.
