# Research Digest (2026-10-13)

What five research agents found, condensed for builders. [U] means unverified, from a secondary source or the agent's own knowledge. Re-check [U] items before relying on them.

## 1. Orchestration (Claude Code)
- Subagent files: `.claude/agents/*.md`. Frontmatter fields: `name`, `description`, `model` (fable|opus|sonnet|haiku|full id|inherit), `tools`, `disallowedTools`, `permissionMode`, `maxTurns`, `effort`, `isolation: worktree`, `background`, `memory`, `skills`, `hooks`.
- How a subagent's model is chosen, first match wins:
  1. the model passed in the call;
  2. `model` in the agent's frontmatter;
  3. `CLAUDE_CODE_SUBAGENT_MODEL`;
  4. the main session's model.

  Don't set `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`. Subagents with no `model` inherit Fable, which is expensive.
- Default limits: nesting 3 deep, up to 20 subagents at once. `isolation: worktree` branches from the default branch, not from the parent's HEAD.
- Workflow tool: JS scripts using agent/parallel/pipeline/phase. Resumable, and survives VM reclaim in cloud sessions. 16 run at once, 1000 per run.
- Agent teams: experimental, no resume, high token cost. Skip.
- Cloud sessions:
  - Ubuntu 24.04 with Node, pnpm and JDK 21. No Android SDK, no KVM.
  - Setup script results are cached only if the script finishes in ≤5 min.
  - The VM pauses when idle and can be reclaimed, which loses background jobs.
  - Auto mode is the recommended hands-off permission mode. `bypassPermissions` set in settings files is ignored in the cloud.
- Routines: triggered on a schedule (at most hourly), through an API, or by GitHub events. Each run is a fresh session. A green run means no infrastructure error, not that the task succeeded.
- Patterns from Anthropic engineering posts:
  - "Effective harnesses for long-running agents": an initializer agent sets things up, then coding agents work from `features.json` (where agents only flip `passes`), a progress file and `init.sh`.
  - "Harness design for long-running apps" (Mar 2026): a planner/generator/evaluator split. A separate, skeptical evaluator is much easier to tune than self-grading.
  - The C-compiler post: lock files plus file ownership to avoid collisions.
  - Multi-agent systems use about 15× the tokens of a single chat.
- Sources:
  - code.claude.com/docs/en/{sub-agents,workflows,routines,cloud-environments,permission-modes,model-config}
  - anthropic.com/engineering/{effective-harnesses-for-long-running-agents, harness-design-long-running-apps, building-c-compiler, multi-agent-research-system, managed-agents}

## 2. Expo / EAS / Play
- Expo SDK 57 is current (expo 57.0.28, RN 0.86); SDK 58 is in beta. Expo modules use the SDK version number (expo-camera 57.0.6, expo-router 57.0.26).
- A dev build is required for AdMob and Firebase (`expo-dev-client`).
- EAS Workflows (`.eas/workflows/*.yml`):
  - Job types: `build`, `maestro` (alpha), `submit`.
  - Android emulator on `runs_on: linux-large-nested-virtualization`.
  - Maestro params: `flow_path`, `record_screen`, `device_identifier`, `retries`, `shards`.
  - Maestro `takeScreenshot` output goes to the "Maestro Test Results" artifact.
  - `eas workflow:run file --wait` exits 0 on success, 11 on failure. `eas workflow:view <id> --json` gives artifact `downloadUrl`s.
  - Validate a workflow file with `eas workflow:validate`.
- Build profile for e2e: `"e2e-test": {"withoutCredentials": true, "android": {"buildType": "apk"}}`.
- Expo agent tooling:
  - Install the plugin: `claude plugin install expo@claude-plugins-official`. Skills include eas-workflows, eas-app-stores, expo-ui, expo-router, expo-dev-client and expo-upgrade.
  - The Expo MCP server (`https://mcp.expo.dev/mcp`) has remote tools for docs and EAS. Its screenshot tools need a local emulator, so they won't work here.
  - EAS Simulator (cloud emulator driven via agent-device) is waitlisted, and its Android support is still "in development".
- EAS pricing:
  - Starter: $19/month, includes $45 of credit.
  - Android build: about $1 on a medium worker, $2 on large.
  - Free tier: about 15 Android builds per month [U].
- Firebase Test Lab: free tier of 10 virtual and 5 physical runs per day; `gcloud firebase test android run --type robo`.
- Play:
  - `eas submit` can do the first submission. Before that, by hand: create the app in Play Console and set up a service account JSON with release permissions.
  - Tracks: internal, alpha (closed), beta (open), production.
  - Personal accounts created after 2023-11-13 need 12 testers × 14 days in a closed test before production. Organization accounts (D-U-N-S) are exempt.
  - Android developer verification starts 2026-09-30 in 4 countries and goes global in 2027 [U]. Play-registered developers satisfy it through Play.
- Library versions:
  - react-native-google-mobile-ads 17.2.0 (needs RN ≥0.86; `AdsConsent` handles UMP)
  - @react-native-firebase 26.4.0
  - @shopify/react-native-skia 2.14.0 (peer deps: reanimated ≥4 and worklets)
  - expo-sensors 57.0.3: Magnetometer updates faster than 200 ms need `HIGH_SAMPLING_RATE_SENSORS`
  - expo-notifications 57.0.22: needs `POST_NOTIFICATIONS` on Android 13+
  - react-native-view-shot 6.1.1
- Network: expo.dev and api.expo.dev are blocked by this environment's policy until they're allowlisted.

## 3. Design tooling and the "AI look"
- Impeccable (pbakaus):
  - One skill with about 24 `/impeccable <cmd>` commands (critique, audit, polish, distill, harden, typeset, layout, animate, …) and 59 deterministic detector rules.
  - Install: `npx impeccable install --providers=claude --scope=project`. It adds a hook that runs the detector on UI edits.
  - It's web-oriented. Use it on the Expo web export and apply its guidance by hand on native.
- Anthropic `frontend-design` skill: its avoid-list includes "near-black with a single acid-green accent" and "monospace data labels". Our explicit brief overrides that, so we escape the cliché by specificity: copy one concrete instrument faithfully.
- taste-skill: skip it. Three overlapping rule sets would conflict.
- AI tells:
  - Visual: purple/blue gradients; Inter everywhere; uniform rounded cards with a soft shadow; emoji icons; everything centred; big-number hero; 01/02/03 markers on things that aren't sequences; eyebrow labels; → on every button; fade-up on everything; bouncy easing; pure black.
  - Copy: delve, tapestry, pivotal, crucial, intricate, testament, foster, underscore; em-dash asides; lists that are always three items.
- Instrument references:
  - Alien: Isolation tracker: built to "feel broken", monochrome, routed through real VHS.
  - K-II meter LED ladder, FLIR scale bar, oscilloscope 8×10 graticule, Pip-Boy bezel.
  - A needle with mass and overshoot; serial numbers and calibration dates; engineer shorthand.
- Typefaces:
  - VT323 (OFL, from DEC VT320 glyphs)
  - IBM Plex Mono (OFL; the name is reserved)
  - B612 / B612 Mono (Airbus cockpit) [licence U]
  - Avoid Space Mono and JetBrains Mono.
- Judging with models:
  - MLLM judges agree with humans on only some dimensions (arXiv 2510.08783).
  - They have position bias.
  - They're fooled by surface polish (arXiv 2505.15249).
  - So: swapped-order A/B, a judge from a different model, reference images, and deterministic checks first.
- Sources:
  - github.com/pbakaus/impeccable
  - github.com/anthropics/claude-code/.../frontend-design/SKILL.md
  - github.com/expo/skills
  - Engadget and Xbox Wire coverage of Alien: Isolation
  - flowingdata.com (signs of AI writing)

## 4. Market, psychology, policy, law
- Competitors:
  - Zeepa "Ghost Detector Entity Radar": about 2.5M installs, 3.5★, about $10K/month (AppGoblin estimate) [U].
  - Ghost Radio EVP (paid, $4.99): 100K installs, 4.0★.
  - The category is crowded and near-identical; "prank" often appears in the package ID.
  - Reviews: 1★ = too many ads, or "same result every time". 5★ = scary moments, fun with friends [U].
- TikTok: the viral unit is a shareable capture (filters), not the app itself.
- Psychology:
  - Wiseman 2002: suggestion raises reported experiences.
  - Riekki 2013: pareidolia in believers.
  - Clasen 2020, *Playing With Fear*: inverted U between fear and enjoyment.
  - Also: Schultz 1997 and Fiorillo 2003 (reward uncertainty), Forer 1949, Kahneman 1993, Loewenstein 1994.
- AdMob:
  - No interstitial at launch or exit (use App Open ads instead); only at natural breaks; at most 1 interstitial per 2 user actions; never two interstitials back to back; preload.
  - Ban causes: clicking your own ads, incentivized clicks, layouts that cause accidental clicks.
  - eCPM [approximate]: US rewarded/interstitial about $16; EU rewarded about $5; LatAm rewarded about $1.8; banners $0.5–1.5.
- Play policy:
  - "Functionally impossible" claims are prohibited. Calling an app a "prank" or "for entertainment" **does not exempt it**. Metadata must reflect what the app actually does. No fake system warnings.
  - Data safety for the Mobile Ads SDK: device IDs, app interactions, diagnostics. Photos processed only on the device count as "not collected".
- Content rating: IARC questionnaire. Expect around PEGI/USK 12 for horror [U]. Set the target audience to 13+ to avoid the Families policy.
- Germany:
  - Impressum required under §5 DDG; ad-funded counts as commercial.
  - TDDDG §25 consent plus GDPR, using a Google-certified TCF CMP (UMP).
  - Register a Gewerbe [U, check with the IHK].
  - Kleinunternehmer status under §19 UStG (2025): ≤€25K in the prior year and ≤€100K in the current year.
  - AdMob pays from Google Ireland, likely under reverse charge [U, ask a tax advisor].
  - DSA trader status: expect your address to be shown on the listing.
- Sources:
  - support.google.com/googleplay/android-developer/answer/9888077
  - support.google.com/admob/answer/6201362
  - developers.google.com/admob/android/privacy/play-data-disclosure
  - psychologicalscience.org/observer/playing-with-fear
  - uhra.herts.ac.uk/id/eprint/2334
  - appodeal.com eCPM report
  - ihk.de (Impressum, Kleinunternehmer)
  - revenuecat.com (trader status)

## 5. Ghost FX
- Skia: v3 is published as `react-native-skia` (Graphite on Dawn, Vulkan, API 26+, not Expo Go); `@shopify/react-native-skia` stops at 2.14. Choose before building. The plan uses 2.14.
- Double-exposure look:
  - Screen/Plus blend at 8–25% opacity.
  - Blur the ghost more than the scene; add directional motion blur (3–6 offset copies).
  - Feather the edges with a noise mask and occlude part of the figure.
  - Clamp peak brightness just above the region's mean.
  - **Apply the same grain after compositing.**
  - Keep it under 15% of the frame and off-centre. No glowing eyes, no symmetry.
- Finding dark regions:
  1. Use a CPU raster image (`makeRasterImage`) and downsample to 64–96².
  2. Compute luma (0.2126R + 0.7152G + 0.0722B) and an integral image.
  3. Threshold at the 20th percentile.
  4. Find 4-connected components.
  5. Score each by area × darkness × low variance, with a penalty for touching the frame edge.
  6. Run once per photo.
- Shaders:
  - `Skia.RuntimeEffect.Make`. `RuntimeShader` ignores pixel ratio, so supersample.
  - Built-in FractalNoise and Turbulence shaders.
  - CRT effect: port crt-lottes (public domain per its header [U]).
  - Ironbow thermal palette [U]: #010930, #7501A0, #D02574, #FF7613, #FCC601, then pale yellow. Render at about 160×120 and upscale.
- Assets, in order of preference:
  1. Procedural.
  2. Staged own photos (owned outright, most realistic).
  3. Mumler-era public-domain photos (licence per file [U]).
  4. Image generators, only as degraded greyscale mattes.
- Audio:
  - `react-native-audio-api` (Web Audio-style, dev build) for procedural Geiger (Poisson-timed 1–3 ms noise bursts), 50/60 Hz hum and filtered static.
  - Freesound clips only under CC0.
  - The Sonniss licence forbids AI training since 2024.
- Sources:
  - github.com/Shopify/react-native-skia (docs: migration, image, runtime-shader)
  - docs.swmansion.com/react-native-audio-api
  - spirit-photography histories (OUP blog, history.com)
