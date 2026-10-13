# Competitor teardown (P1-01)

Owner: Dr. Hollow · 2026-10-13 · Inputs: `docs/MASTER-PLAN.md` §1, §7, §8; `docs/research/2026-10-research-digest.md` §4; `docs/psych-brief.md`.

## Method and confidence

One fetch of the Play store search page failed (DNS blocked from this container). Everything below comes from the digest or from my own knowledge of the category. Facts the digest marks as checked carry no tag. Anything else carries [U] and must be re-checked on a phone before P9. Install counts and ratings are given only where the digest has them; otherwise "unknown".

Six entries. Three are named apps. Three are archetypes, because dozens of near-identical listings share one name and one template ("EMF Detector", "Spirit Box", "Ghost Camera Prank"); the digest calls the category crowded and near-identical, with "prank" often in the package ID. Treating each clone family as one entry is more useful than picking one clone at random.

Lever names come from the plan §7 table: Priming, Pareidolia, Fear dosing, Variable ratio, Barnum, Peak-end, Curiosity gap, Authority cues, Belief calibration.

## 1. Ghost Detector Entity Radar (Zeepa)

Numbers: about 2.5M installs, 3.5★, about $10K/month by an AppGoblin estimate (digest, itself [U]).

Claims: detects entities near you on a radar and names them [U]. The listing leans on detection language with an entertainment disclaimer lower down [U]. Play policy says that disclaimer is no exemption.

Flow [U]:
- Boot: splash, then an ad-consent or interstitial before the instrument appears.
- Main instrument: a circular sweep radar with blips, a numeric "EMF" readout and sometimes a word box that prints single words.
- Result: a blip gets a label (entity type, distance). No photo, no artefact to keep.

Monetization [U]: banner pinned to the bottom of the radar screen; interstitials on screen changes and often on start; rewarded video to unlock "premium" detection modes. No clear paid tier.

Reviews: the 2.5M installs with a 3.5★ mean fits the digest pattern. 1★: too many ads, the same blips and words every time. 5★: a word that matched something in the room, scaring a friend [U for the per-app split].

Levers used: Variable ratio (blips arrive at random), Authority cues (radar, numbers), Pareidolia in a verbal form (a random word read as meaningful).
Levers missed: Peak-end (an ad sits where the peak should be), Fear dosing (no intensity control), Priming (no context before the sweep), Curiosity gap (nothing half revealed). The randomness is thin, so Variable ratio decays into "same result" within a few sessions.

Visual tells [U]: stock radar sweep in neon green, a glossy chrome bezel, clip-art ghost icons as blips, a skull or ghost emoji in the app icon.

## 2. Ghost Radio EVP

Numbers: paid, $4.99, 100K installs, 4.0★ (digest).

Claims: a spirit box that scans radio-like noise so voices can come through [U].

Flow [U]:
- Boot: straight into the instrument. No ads, so no gate.
- Main instrument: a frequency dial that sweeps, static bursts, chopped audio fragments, a record button.
- Result: whatever the listener hears. Recordings can be saved and replayed.

Monetization: up-front price only, which is why the rating holds at 4.0★ with a smaller base. No ads [U].

Reviews [U]: praise for sound quality and "it said my name"; complaints that fragments repeat, and buyer's regret from people expecting proof.

Levers used: Pareidolia in audio (users hear words in chopped speech), Priming (users go in already asking questions), Authority cues (dial, frequency numbers).
Levers missed: no visual result, no share artefact, so no Peak-end moment anyone can show. No Fear dosing. Variable ratio depends on the sample pool, which is finite.

Visual tells [U]: skeuomorphic radio, wood or brushed-metal texture, amber LCD digits. Closer to "real gear" than most of the category.

Lesson for us: the paid audience rewards an app that feels like equipment and does not nag. Our ad rules in plan §8 try to keep that feeling with a free model.

## 3. GhostTube SLS

Numbers: installs unknown, rating unknown.

Claims: uses the camera to detect human figures in empty rooms and draws them as stick figures, after the "SLS camera" seen on ghost-hunting TV [U].

Flow [U]:
- Boot: account or onboarding screens, then camera.
- Main instrument: live camera with stick-figure overlays that appear when the pose detector fires on clutter (coats on chairs, shadows).
- Result: a screenshot or clip with the stick figure. Sharing is built in.

Monetization [U]: subscription for extra features; some ads in the free tier.

Reviews [U]: praise for live, real-time figures and clips worth posting; complaints that the figure appears on any chair or curtain, and about the subscription prompt.

Levers used: Pareidolia done by a machine, on the user's own room, which is the strongest version of the lever in the category. Authority cues (TV association, camera tech). A share artefact, so Peak-end lands on something visible.
Levers missed: Fear dosing (figures fire constantly, so they stop meaning anything), Curiosity gap.

Visual tells [U]: green stick figures over the live feed, a busy HUD.

Lesson: the user's own photo with something in it is the unit people share. We take that and make the figure rare and faint.

## 4. Archetype: "EMF Detector / EMF Meter" clones

Numbers: many listings, installs and ratings unknown per listing.

Claims: measures the magnetic field and calls spikes "paranormal activity" [U].

Flow [U]:
- Boot: splash, interstitial.
- Main instrument: a needle or bar reading µT from the real magnetometer, with a five-LED strip copied from the K-II meter.
- Result: none. The needle moves when you hold the phone near a speaker.

Monetization [U]: banner on the meter screen, interstitials on navigation, "remove ads" in-app purchase.

Reviews [U]: praise that it reacts to real things; complaints that it is just a compass sensor, and ads.

Levers used: Authority cues, and real ones: the magnetometer reacts. Levers missed: almost everything else. No outcome, no Variable ratio beyond what the house wiring provides, no Peak-end.

Visual tells [U]: K-II LED strip, neon green on black, a gauge from a stock icon pack.

Lesson: a real sensor is a strong trust anchor. Our needle uses it (psych brief §2.8) and claims nothing about spirits.

## 5. Archetype: "Spirit Box" clones

Numbers: many listings, unknown.

Claims: talk to spirits through a word generator [U].

Flow [U]: splash and interstitial, a scrolling frequency or a noise visualizer, then single words printed or spoken at random intervals ("COLD", "HELP", "LEAVE").

Monetization [U]: banner plus interstitial, often after each session; rewarded video for "stronger signal".

Reviews [U]: 5★ for a word that seemed to answer a question; 1★ for the same ten words looping and ads.

Levers used: Pareidolia (verbal), Variable ratio (timing). Levers missed: Barnum done badly. The word pool is too small, so coincidence becomes repetition and the spell breaks.

Visual tells [U]: waveform from a template, purple-to-green gradient, Creepster-style horror font.

## 6. Archetype: "Ghost Camera Prank" clones

Numbers: many listings, unknown. "Prank" in the package ID is common (digest).

Claims: puts ghosts in your photos "to scare friends" [U].

Flow [U]: camera, a sticker picker of ghosts, place and save.

Monetization [U]: interstitial after every save, banner on the picker, paid sticker packs.

Reviews [U]: fun for one prank; complaints that the ghosts look fake.

Levers used: social play (fun with friends). Levers missed: Pareidolia is thrown away because the ghost is a full, sharp, centred cut-out. No instrument, so no Authority cues. Once the friend has seen it, it is over.

Visual tells: clip-art ghosts with glowing eyes, bedsheet ghosts, a skull in the icon [U]. This is the look plan §6 bans.

## Synthesis

### What we copy and what we avoid

| Copy | Reason |
|---|---|
| A real magnetometer driving the needle (EMF clones) | A real reaction to a speaker or laptop earns trust no fake readout can. Authority cues. |
| The user's own room as the canvas (GhostTube SLS) | A figure in your own photo is personal and shareable. Pareidolia plus Peak-end. |
| Gear that feels like gear, no nagging (Ghost Radio EVP) | Paid users rate it 4.0★. Our free model keeps that feel by keeping ads off the peak. |
| A spoken or audio fragment as a rare extra | Audio Pareidolia works; we gate it to STRONG and CRITICAL and the Deep Scan so it stays rare. |
| A saved artefact that leaves the app | The viral unit is the capture, per the digest. |

| Avoid | Reason |
|---|---|
| Interstitial at launch or on the result | Top 1★ complaint and an AdMob violation at launch. It also becomes the memory of the peak (Peak-end). |
| Small output pools that loop | "Same result every time" is the other top 1★ complaint. Our seed uses photo hash plus timestamp, and names do not repeat within 20 results. |
| Clear, centred, glowing clip-art ghosts | Kills Pareidolia and reads as a prank. Plan §6 bans it. |
| Figures on every scan | Constant hits stop meaning anything (GhostTube SLS). Fear dosing says most scans stay calm. |
| Detection claims with an entertainment footnote | Play says the footnote is no exemption. We say "simulated" in the listing and on the sticker. |
| Neon green radar, chrome bezels, horror display fonts | Visual tells of the clone template. One phosphor hue, two faces, per plan §6. |

### Five moments where this category leaks users

1. Launch to first reading. Clones put a splash, consent and an interstitial before the instrument. Our plan: no ad in session 1, boot is 6 s of in-character theatre, and the instrument is live by 12 s.
2. The first result is empty. A meter or radar that shows nothing on the first try reads as broken. Our plan: scan 1 is always ACTIVE or STRONG (psych brief §3).
3. The third or fourth session, when output repeats. The pool runs dry and the user spots the loop. Our plan: photo-seeded results, 24 entity classes, 60+ lines per profile slot, no repeats within 20 results.
4. The ad after a scary moment. The scare lands, then a game ad plays over it. Our plan: no interstitial after STRONG, CRITICAL or a jump-scare; interstitials only on the return to the viewfinder, at most 1 per 2 scans and 1 per 3 minutes.
5. The scare that goes too far. A loud jump-scare in a dark room ends the group session and earns an uninstall. Our plan: jump-scares only on CRITICAL, never in the first 3 scans, a Calm mode with them locked off, and a slider offered right after one fires.

### The shareable unit

Per the digest, the viral unit on TikTok is a capture with a filter look, not the app. None of the clones builds a card for it: users screen-record the whole UI, ads and banners included. Ours is the share card: the user's photo with the faint figure, the score and tier, the thermal inset, case number, location tag and time, framed as an instrument printout with the app name small in the corner. A 6 to 10 s vertical clip of the scan theatre into the reveal is the second format, cut so the 1.2 s silence and the number landing sit in the first 5 s of the video. The card never shows an ad and never reveals the redacted profile lines, so the gap travels with it.

### Hypotheses for P10 tuning

| # | Hypothesis | Metric that would confirm it |
|---|---|---|
| H1 | A guaranteed ACTIVE or STRONG first scan raises day-1 retention against a plain table draw. | D1 retention at least 5 points higher in the guaranteed arm (Firebase A/B). |
| H2 | Skipping the interstitial after STRONG and CRITICAL raises shares more than it costs in revenue. | Shares per 100 STRONG+ results up at least 20% while ARPDAU drops under 10%. |
| H3 | Photo-seeded, non-repeating results reduce "same result" complaints. | Share of 1★ and 2★ reviews mentioning repetition under 5% in the first 500 reviews (category baseline is a top-2 complaint). |
| H4 | A partial decode at 41 to 73% converts to Deep Scan better than a flat "unlock profile" offer. | Rewarded opt-in rate per ACTIVE+ result at least 1.3× the flat-copy arm. |
| H5 | Sceptics mapped to Brave scan as long as believers on Standard. | Median scans per session for "No" users within 15% of "Yes" users; uninstall within 10 minutes of a jump-scare under 3%. |

## [U] count

Facts tagged [U] in this file: 32 tags, most covering a block of several claims (per-app flow, monetization, reviews, visual tells). Re-check them on a phone with the live listings before P9.
