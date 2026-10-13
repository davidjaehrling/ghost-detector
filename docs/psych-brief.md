# Psychology Brief (workstream Ψ)

Owner: Dr. Hollow · 2026-10-13 · Binding inputs: `docs/MASTER-PLAN.md` §1, §5 to §8, and `docs/research/2026-10-research-digest.md` §4.

This brief is the shared source for identity (B), engine (C), screens (E), copy (G), share and notifications (I) and monetization (M). Numbers here are starting values. P10 tunes them from analytics; any change goes through the panel and into `docs/decisions.md`.

## 1. The user and the moment

Who opens this app: people aged 16 to 30, mostly in groups of two to five, who already like horror films, ghost-hunting videos or haunted-house attractions. A smaller group opens it alone. The store listing says readings are simulated, so nobody arrives expecting a scientific instrument. They arrive wanting a good story they can half believe for ten minutes.

Where: three settings cover most first sessions.
- A dark cellar, attic or stairwell at night, phone held out like a torch, someone standing behind the holder.
- A party or sleepover, phone passed around, scans pointed at friends and corners for laughs and screams.
- A dare: one person sent into a room alone to "take a reading" and come back with proof.

The emotional target is pleasant tension with release, the middle of Clasen's inverted U (*Playing With Fear*, Clasen et al. 2020). Too little arousal and the app is a toy that gets uninstalled; too much and the group stops passing the phone. The second target is social: a result worth showing someone within 5 seconds of seeing it. The digest notes that 5-star reviews mention "scary moments, fun with friends" and that the viral unit on TikTok is the shareable capture.

The 60-second first session:
- 0 to 6 s. Boot. Relay click, CRT warm-up, firmware line, then the calibration sticker: "SIMULATION UNIT. ENTERTAINMENT USE." It reads as a real label on real gear and it discharges the Play policy duty on first launch.
- 6 to 12 s. One question, one tap (belief calibration, §2.9). The answer sets intensity and priming.
- 12 to 22 s. Viewfinder. The needle moves with the real magnetometer as the user sweeps the phone. A one-tap location tag (Cellar, Attic, Bedroom, Hallway, Outdoors) triggers a two-line lore note and tonight's activity index.
- 22 to 24 s. Capture. Shutter, flash of phosphor, the frame freezes.
- 24 to 32 s. Scan theatre, 8.0 s. Sweep line, rising Geiger rate, three telemetry lines, a 1.2 s silent hold before the number lands.
- 32 to 44 s. Reveal. First scan is always ACTIVE or STRONG (§3). A faint figure sits in the darkest region of their own photo, partly hidden. Thermal view shows a cold spot of -3 to -7 ΔT °C.
- 44 to 54 s. "Signature partially decoded: 58%." Two profile lines visible, the rest redacted. In session 1 the first Deep Scan is free, so the user learns what the rewarded offer contains before any ad exists.
- 54 to 60 s. Share card offered. No ad anywhere in session 1.

## 2. Levers

### 2.1 Priming
Mechanism: telling people a place is active raises the number of unusual experiences they report there. Expectation lowers the threshold at which ambiguous input gets read as meaningful. Source: Wiseman et al. 2002 (Hampton Court study).

Implementation:
- Viewfinder shows an "activity index" from 1 to 5 built from the real moon phase (full moon ±2 days adds 1) and local time (22:00 to 04:00 adds 1, 03:00 to 03:59 adds 2). Base value is 2.
- Each location tag has 6 lore notes per locale, 2 lines each, written as field-manual entries ("Cellars hold cold air. Readings below grade run 12% high."). No repeat within 10 scans.
- Effect on the engine: each index point above 2 moves 2 percentage points from QUIET to ACTIVE and STRONG (split 1:1). The maximum shift is 6 points. CRITICAL rates are never touched by priming, so rarity holds.
- Priming strength follows the onboarding answer: "Yes" shows lore before every scan, "Not sure" before every second scan, "No" only on first use of each tag.

### 2.2 Pareidolia
Mechanism: the brain completes faces and bodies from noise, and believers do so at a looser criterion than sceptics. An ambiguous shape invites the viewer to finish it, which feels more real than a clear one. Source: Riekki et al. 2013.

Implementation:
- Figures follow plan §6: Screen/Plus blend at 8 to 25% opacity, under 15% of the frame, off-centre, more blur than the scene, grain applied after compositing, 30 to 60% of the silhouette occluded or feathered away.
- Opacity bands by belief answer: "Yes" 8 to 14%, "Not sure" 11 to 18%, "No" 14 to 22%. Sceptics get slightly more to look at; believers fill the gap themselves.
- TRACE results show no figure in 75% of cases and a "smudge" (a blurred vertical density, no head shape) in 25%. The user decides what it is.
- The engine never places a figure in a region brighter than the frame median. No glowing eyes, no faces with full features, no symmetry.

### 2.3 Fear dosing
Mechanism: enjoyment of fear rises with arousal up to a personal optimum, then falls. Most of the experience should sit below the peak so that rare spikes land. Source: Clasen et al. 2020, *Playing With Fear*.

Implementation (full table in §3):
- Calm: figure on about 19% of scans, CRITICAL 1 per 100, no jump-scares, Geiger capped at 6 clicks/s, thermal cold spot no colder than -4 ΔT °C.
- Standard: figure on about 34% of scans, CRITICAL 4 per 100, jump-scare on, Geiger up to 14 clicks/s.
- Brave: figure on about 50% of scans, CRITICAL 8 per 100, jump-scare on and twice as likely, Geiger up to 22 clicks/s, an EVP fragment on every STRONG result.
- Intensity is one control in Settings and a 3-position slider on the result screen after any jump-scare ("Too much? Set CALM."). A change applies from the next scan.

### 2.4 Variable ratio
Mechanism: unpredictable rewards hold attention longer than fixed ones, and dopamine neurons respond most when the outcome is uncertain. A schedule where the big result might come on any scan keeps people scanning. Sources: Ferster and Skinner; Schultz 1997; Fiorillo 2003.

Implementation:
- Score 0 to 100 in five tiers: QUIET 0 to 19, TRACE 20 to 44, ACTIVE 45 to 69, STRONG 70 to 89, CRITICAL 90 to 100. The distribution is right-skewed, with the mode in TRACE.
- Scan duration varies: base 6.0 to 8.0 s, uniform. STRONG and CRITICAL add 1.0 to 2.0 s. 30% of QUIET and TRACE scans also get the extension, so a long scan raises hope without giving the answer away.
- Guard rails: at least 5 scans between two CRITICAL results. A dry-spell rule forces STRONG if 12 scans in a row (Standard; 16 Calm, 8 Brave) produced nothing above ACTIVE.
- Never the same result twice: the seed combines a hash of the photo with a capture timestamp, so two different photos never match, and rescanning the same photo gives a new reading. Entity names and profile lines do not repeat within the last 20 results. This answers the "same result every time" 1-star pattern in the digest.

### 2.5 Barnum effect
Mechanism: people rate vague statements that apply to almost anyone as accurate descriptions of their own situation. Specific-sounding wording raises the effect. Source: Forer 1949.

Implementation:
- Each entity profile has 5 slots: class, estimated era, temperament, attachment, behaviour. At least 3 lines must be high base-rate statements: "Activity rises after 22:00." "Drawn to the lowest room in the building." "Attached to an object older than the current occupants." "Most active when the house is quiet."
- 1 line carries a specific-sounding detail that cannot be checked (an era range of 40 to 80 years, a case code).
- Content limits: no references to dead relatives, illness, real deaths, real addresses or named people; no instructions to the user to do anything in the real world.
- Pool size at launch: 24 entity classes and at least 60 lines per slot per locale.

### 2.6 Peak-end rule
Mechanism: people judge an experience by its most intense moment and its final moment, and give the average little weight. A strong peak and a clean ending make a session remembered as good. Source: Kahneman et al. 1993.

Implementation:
- The reveal is the peak: 1.2 s silence, then the number lands with a single haptic transient, the needle overshoots and settles in 600 to 900 ms, and the figure fades in over 1.5 s.
- No ad, no rating prompt, no permission dialog, no consent sheet on the reveal or for 3 s after it.
- The ending is the share card or the investigation log entry. The log's session summary shows the peak reading of the session ("Peak: 84 STRONG, Cellar, 23:41"), never an average.
- If the user closes after a QUIET result, the next open starts with the log line of their best reading so far.

### 2.7 Curiosity gap
Mechanism: a noticed gap between what you know and what you want to know produces a drive to close it. The gap works best when it is specific and looks almost closed. Source: Loewenstein 1994.

Implementation:
- ACTIVE and above show "Signature partially decoded: N%", where N is 41 to 73%. Two of the five profile slots are visible; three are redacted bars of the right length.
- The Deep Scan unlocks the rest, the high-resolution apparition and an EVP line of 2 to 4 s. Offer copy direction in §5.
- The gap is offered once per result. QUIET and TRACE show no offer: there is nothing to decode, and offering it would teach users that the offer is empty.

### 2.8 Authority cues
Mechanism: the plan cites no study here. The working principle is that real readings, units and calibration marks make the frame of a scientific instrument believable, which strengthens every other lever.

Implementation:
- The needle uses the real magnetometer. Display in mG (1 µT = 10 mG); Earth's field reads about 250 to 650 mG, and a speaker or laptop nearby makes it jump. That jump is real and users will test it.
- Calibration sticker: manufacturer, model, serial, firmware, calibration date, all fictional and owned by workstream B.
- Fault codes appear on 1 in 15 scans ("E-07 SENSOR DRIFT. RECALIBRATING.") and add 1.5 s.
- The magnetometer only shapes needle motion and a small seed input. Nothing in metadata or copy says it detects spirits.

### 2.9 Belief calibration
Mechanism: the same stimulus produces different experiences in believers and sceptics (Riekki 2013), and priming works on expectation (Wiseman 2002). One answer lets the app set both.

Implementation:
- Question, once, after the sticker: "Have you ever experienced something you couldn't explain?" Answers: "Yes", "Not sure", "No". One tap, no skip needed; a small "Skip" link defaults to "Not sure".
- Mapping: "Yes" sets Standard, full priming, faint figures (8 to 14%). "Not sure" sets Standard, medium priming, 11 to 18%. "No" sets Brave, light priming, 14 to 22%, and more instrument telemetry on screen. Sceptics need a stronger stimulus to reach the same arousal.
- Then one line: "Intensity set to STANDARD. Change any time in Settings." Calm is always one tap away.

## 3. The scare dosing curve

Outcome probabilities per scan, before priming shift (§2.1) and guard rails (§2.4). Each row sums to 100%.

| Intensity | QUIET | TRACE | ACTIVE | STRONG | CRITICAL | Figure shown | CRITICAL per 100 scans |
|---|---|---|---|---|---|---|---|
| Calm | 30% | 40% | 22% | 7% | 1% | ≈19% | 1 |
| Standard | 20% | 35% | 28% | 13% | 4% | ≈34% | 4 |
| Brave | 12% | 28% | 32% | 20% | 8% | ≈50% | 8 |

Figure rule: none on QUIET, smudge only on 25% of TRACE, figure on 50% / 60% / 70% of ACTIVE (Calm / Standard / Brave), figure on every STRONG and CRITICAL. CRITICAL adds the semantic red, a cold spot of -6 to -9 ΔT °C and an EVP fragment.

First-session overrides: scan 1 is ACTIVE (70%) or STRONG (30%). Scans 2 and 3 use the table with CRITICAL removed and its share moved to STRONG. From scan 4 the table applies as written.

Jump-scare rule:
- Only possible on a CRITICAL result. Probability given CRITICAL: Calm 0%, Standard 25%, Brave 50%. That gives about 1 per 100 scans on Standard and 4 per 100 on Brave.
- Never in the first 3 scans of the install. At most 1 per 24 h on Standard, 1 per session on Brave.
- Toggle in Settings ("Jump-scares: ON/OFF"), default ON for Standard and Brave, locked OFF on Calm.
- Shape: 400 to 600 ms, distorted full-frame figure plus static burst at a peak of -6 dBFS and one strong haptic. No more than 3 flashes in any 1 s (WCAG 2.3.1 threshold). Fires at 70 to 90% of scan progress, then the reveal follows normally.
- No interstitial on the return after a jump-scare result.

## 4. The session arc and retention

What brings someone back tomorrow:
- The activity index changes daily with the moon and is shown on the boot screen. A full moon is an event; the app says so in the log a day ahead.
- The investigation log: every scan becomes a case entry with case number, time, location tag, score, thumbnail and, after a Deep Scan, the entity class. Entries are kept on the device only.
- The entity catalogue: 24 classes, each marked "unconfirmed" until a Deep Scan logs it. Completion is a slow pull that needs no streaks.
- No streak counters, no loss framing, no penalties for missed days.

Notification policy:
- Opt-in only. The ask comes after the 3rd scan or the first STRONG result, whichever is first, on a screen in the game's voice, and only then the Android permission dialog. Never at first launch.
- At most 1 per day and 3 per week, delivered between 18:00 and 22:00 local. Never at night, even though the lore talks about 03:00.
- Voice: field log, terse, with data. Examples of direction: "FIELD LOG. Moon 96%. Conditions favourable after 22:00." "Case 0041 unresolved. Signature 63% decoded."
- Forbidden: titles like "Warning", "Alert", "Detected"; anything stating that activity was detected in the user's home while the app was closed; system-style icons, red badges or alarm sounds; mimicking Android or carrier alerts. The app name and icon are always visible.
- Back-off: if 7 days pass with no open, notifications stop until the next open.

## 5. Monetization moments

Rewarded Deep Scan:
- Offered on the result screen for ACTIVE, STRONG and CRITICAL, below the partial profile, at least 48 dp away from Share and Rescan.
- Copy direction: name the exact gap and the exact contents. "Signature 58% decoded. Run DEEP SCAN to resolve class, era and EVP. (Short video.)" State plainly that a video plays. No countdown timers, no "last chance".
- Session 1: the first Deep Scan is free. From session 2: rewarded only. Declining has no cost and the offer does not reappear for that result.

Interstitials allowed (plan §8 and digest §4):
- Only on the return from a result to the viewfinder.
- Never in session 1. At most 1 per 2 scans and 1 per 3 minutes, preloaded.
- My additional limits: skip it if the result was STRONG or CRITICAL, if a jump-scare fired, if a rewarded ad played in the last 3 minutes, or if the user is mid-share.

Forbidden placements: app launch, exit, onboarding, consent, during the scan theatre, on the reveal, on or right after the share flow, two in a row, and anywhere a tap target sits under the close button. The banner lives only on the history log, away from buttons.

Why no ad sits on the peak: peak-end (Kahneman 1993) means the reveal is what the user remembers and retells. An ad there becomes the memory, and the digest shows "too many ads" is the top 1-star complaint. It would also break the in-character spell that every other lever depends on. Protecting STRONG and CRITICAL returns costs perhaps 15 to 25% of interstitial impressions on Standard and protects the moments that drive shares and reviews.

## 6. Red lines from Compliance

I accept each line in plan §7 and §8 without exception. How the levers stay inside:

- Play deceptive-behaviour policy, "entertainment" is no exemption. The listing says readings are simulated; the first launch shows the sticker. Authority cues live inside the fiction (fictional manufacturer, serial) and the real magnetometer is shown as what it is, a field reading in mG. Copy never claims real detection.
- No mimicking system alerts. Notifications follow §4. Jump-scares never imitate an Android dialog, call screen or crash message.
- No accidental-click layouts, no interstitial at launch, exit or a peak. §5 is stricter than the policy. Rewarded is opt-in with plain wording.
- Not aimed at children, 13+ (ideally 16+). Imagery stays grey, grainy and adult-toned with no cute characters. Fear dosing keeps a Calm mode and a jump-scare toggle so younger-teen users who slip through can turn it down.
- Data: priming uses moon phase and local time from the device; no location permission. Photos stay on the device. The log is local.
- Barnum content limits in §2.5 keep profiles away from grief, health and real people.

## 7. Open questions for the panel

1. Should "No" (sceptic) map to Brave? Default: yes, with the result-screen slider shown after their first STRONG so they can step down.
2. Free Deep Scan in session 1? Default: yes, exactly one. It shows the value before the first rewarded offer and costs one impression per install.
3. Interstitial skip after STRONG and CRITICAL? Default: yes. Revisit at P10 only if Firebase shows interstitial revenue under 20% of rewarded revenue.
4. Jump-scare default on Standard? Default: ON, since it only fires on CRITICAL after scan 3, about 1 per 100 scans. Turn it OFF by default if the closed test shows uninstalls within 10 minutes of one.
5. A "Party mode" that raises intensity for groups? Default: no for launch. Brave covers it; add later if analytics show many scans per session from one device.
6. Scan length 6 to 10 s: is it too long for repeat scans? Default: keep it, and from the 10th scan of a session trim the base to 5.0 to 6.5 s while keeping the extension rule.
