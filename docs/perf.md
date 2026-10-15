# Performance record (P8-03)

The one record P8-03 cites. Part 1 is the FX Engineer's `docs/perf-fx.md`, folded in unchanged below. Part 2 is the Builder A pass (main thread, boot, bundle). Guards: `e2e/web/perf-fx.spec.ts` (scan fps, print) and `e2e/web/perf-ui.spec.ts` (boot, bundle). All 390 x 844, numbers print as `[perf-fx]` and `[perf-ui]` lines in the CI log.

## Part 2: Builder A (head 082aa80 plus the main-thread pass)

### Method
- Throwaway probe (not committed): headless Chromium, 390 x 844, CDP CPU throttle, `/viewfinder?fixture=cellar`, CAPTURE, FX frame counter (`window.__fxFrames`) from scan bar to result attach; React commits counted through `__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot` over the same window. Minified export for fps and commits; unminified export for the per-component render counts (fibers with PerformedWork whose subtree changed).
- Both builds exported from separate git worktrees, each with its own `TMPDIR`. Note: Metro's shared `/tmp/metro-cache` served a stale app root across worktrees that symlink one `node_modules`; an export from a worktree then bundled another tree's sources. Always export with a private `TMPDIR` (checked by grepping the bundle for a symbol only the new code has).

### Cause and change
Scan kept the 20 Hz clock in React state, so the route re-rendered every 50 ms and, with it, Housing, Nameplate, 4 Screws, Wear, KeyRow and keys, LedLadder, MiniSticker and Glass (69 renders each per theatre at x4, before). Now:
- `src/ui/scan/clock.ts`: the clock is a small store. The route reads only coarse values (LED count, phase, fault, hold, done) through `useClockSelect`; only `TheatreGlass` reads the frame every tick (`useClockFrame`).
- `app/scan.tsx`: stable props for the housing (memoised keys, glass label, render function, ref-held router).
- `React.memo` on Housing, Nameplate, Screw, PlateScrew, Wear, LedLadder, MiniSticker (re-renders on a language change), KeyRow, Key, DummyCap, BlockBar, Readout, LiveRow.
- Not touched (FX tree): ScopeLayer still re-renders on the 20 Hz frame prop; Glass, GlassOverlay and BurnIn sit inside Housing and now render once per layout from the UI side.

### Numbers (CPU throttle, scan theatre, three runs each, minified export)
| | x2 p50 / p95 / mean (ms) | x4 p50 / p95 / mean (ms) |
|---|---|---|
| before | 16.7 / 33.3 / 17.7; 16.7 / 33.3 / 17.8; 16.7 / 16.8 / 17.5 | 33.3 / 66.7 / 32.8; 16.7 / 50.0 / 26.5; 16.7 / 66.7 / 30.0 |
| after | 16.7 / 33.4 / 19.3; 16.7 / 16.8 / 17.2; 16.7 / 16.8 / 17.0 | 16.7 / 50.0 / 25.7; 16.7 / 50.1 / 26.3; 16.7 / 49.9 / 22.2 |

x4 mean 26.5 to 30.0 ms before, 22.2 to 26.3 ms after; p95 66.7 before (two of three runs), 50 after (all three); p50 was 33.3 in one of three runs before, 16.7 in all three after.

React commits per second over the theatre: x2 45.1 to 46.4 before, 44.9 to 46.8 after; x4 32.4 to 36.0 before, 40.3 to 42.4 after. The commit count did not fall: the 20 Hz tick still commits (the theatre readouts and the Skia scope are React-driven), and at x4 more commits fit into the window because each costs less. The saving is per commit, not in their number.

Components re-rendered per commit (unminified, x4): about 126 before, 75 after. Per theatre: Scan, Housing, Nameplate, KeyRow, Key, LedLadder, MiniSticker, Glass 69 each and Screw 276, DummyCap 207, Wear 138 before; all of them 0 after. What is left per tick is the theatre readouts (TheatreGlass, 2 BlockBars before memo, Readout, LiveRow, about 9 Text, LocaleProvider from RNW Text) and the FX scope (Canvas, Group, Segments).

### Next, in the FX tree
Drive ScopeLayer from a shared value so the 20 Hz tick no longer commits the Skia canvas; that removes most of the remaining commits.

### Goldens
Scan, viewfinder and result specs at 390 against the new export: 42 passed, 11 failed. The same 11 fail on the unchanged 082aa80 export (result quiet/active/strong/critical/bright/outdoors/therm-critical, three deepscan, scan end-to-end), so none moved because of this pass; those 11 goldens were stale before it.

### Guards (`perf-ui.spec.ts`)
- Boot: cold load of `/viewfinder?fixture=cellar` at x2; interactive is the CAPTURE key present and enabled, timestamped in the page from navigation start. Budget under 2500 ms. Measured 1168 ms.
- Bundle: the web export writes no `metadata.json`, so the script tags in `index.html` name the cold-start JS and the sizes are read from the served bytes. Baseline 2 986 773 bytes raw (727 082 gzip); the guard fails above 1.1x, 3 285 450 bytes. Head 082aa80 was 2 986 301.

### Boot regression guard (P8-04 clause 7, D-046)
- Measure: `e2e/web/perf-ui.spec.ts` "cold boot", 390 x 844, CPU x2, a fresh context per run, `/?fixture=cellar` with the belief answer stored; the page's MutationObserver stamps ACK live (key-acknowledge not aria-disabled) and CAPTURE enabled from navigation start; the guard is `interactive - ackLive`.
- Baseline, three runs on the P8-04 tree: 2271, 2325, 2329 ms ACK live to CAPTURE (ACK live 921 to 1020 ms; total 3246 to 3349 ms). Recorded baseline 2325 ms (median).
- Guard: at most 1.2x = 2790 ms; the total keeps the loose 5000 ms bound. It replaces the old 2500 ms budget, which was a harness number with no phone behind it; the phone budget stays phone check 3 item 3.

### Phone check 3 (from Part 1, three items)
1. Scan theatre on the phone: p50 at 55 fps or better, no visible stutter on the sweep.
2. Result print: draw plus encode against the 1.5 s budget (D-034); if over, cut card grain first.
3. Cold start to a live viewfinder under 2.5 s on a mid-range phone.

## Part 1: FX half (FX Engineer, measured on 167b731)

### Method
- Guard: `e2e/web/perf-fx.spec.ts`, 390 x 844 only, CPU throttle via CDP `Emulation.setCPUThrottlingRate` (x4 default, `FX_CPU_RATE=1` for the reference run). Numbers print as `[perf-fx] ...` lines in the CI log.
- Scan theatre: the FX frame counter `src/fx/perf` (`window.__fxFrames`, installed on web by `Glass`, idle until started). The spec opens `/viewfinder?fixture=cellar`, settles 2.5 s, presses CAPTURE, starts the counter when the scan bar shows and stops it in a MutationObserver the moment the result screen attaches (the route change is excluded). Budget: p50 at or above 55 fps (p50 frame time at or under 18.2 ms); p95 recorded.
- Print: `/share-probe?static=1&format=story&case=critical-deep&fixture=cellar`; `renderShareCard` now returns `ms: { load, draw, encode, save, total }`, the probe exposes them as `data-ms-*`. Budget: draw plus encode under 1500 ms.
- Profile: CanvasKit in Node (the share card unit-test harness), each canvas call timed.

### Measured (headless Chromium, SwiftShader, shared 4-core machine, load 2 to 6)
| what | x1 | x4 |
|---|---|---|
| scan p50 / p95 / max frame | 16.7 / 16.7 / 50.1 ms (59.9 fps, 506 frames) | run 1: 33.3 / 83.4 / 116.8 ms (30.0 fps); run 2: 16.8 / 83.4 / 133.3 ms (59.5 fps at p50, 29.2 fps mean) |
| print draw + encode, before P8-03 | 6517 + 750 = 7267 ms | 25830 + 3040 = 28870 ms (load 460, save 447) |

At x4 the scan p50 sits on the 16.7/33.3 ms edge: it passed one run and failed the other. The mean is about 29 fps, so frames do drop under throttle; the cost is the main thread (React re-renders on the 20 Hz scan clock and the 10 Hz trace, plus the per-redraw GPU read-back from P3-09), not one shader.

### Print: what costs what (story card, Node CanvasKit, about x1)
| step | before | after (byte-identical) |
|---|---|---|
| composite shader (1000 x 1240, COMPOSITE_SKSL) | 3129 ms | 254 ms photo pass + 964 ms on the ghost and band rectangle |
| housing shader (1080 x 1920, FractalNoise 3 octaves) | 1502 ms | 437 ms (photo and reading box clipped out) |
| grain pass (1000 x 1240, FractalNoise 2 octaves) | 758 ms | 758 ms (every pixel needs it) |
| ghost layer: 36 figure draws (6 copies x 6 smear taps) + blur | about 900 ms | unchanged |
| apparition render (first card per seed, then cached) | about 1060 ms | unchanged |
| PNG encode (CanvasKit, wasm) | 680 to 808 ms | unchanged |
| total draw, 32-card sweep (5 fixtures x 4 tiers story, 4 square, 8 extra seeds) | 180.5 s | 86.7 s, every card's pixels hash-identical (sha1 of readPixels) |

Changes: `src/fx/compositor/offscreen.ts` + `activeRect.ts` (the full shader runs only where the ghost layer or band can reach; elsewhere PHOTO_SKSL returns the same photo sample; only when grain is 0, as on the card); `src/fx/share/render.ts` `housingCovered` (housing shader clipped where opaque paint lands). Bounding the ghost blur and copy saveLayers was tried and changed 7 of 32 cards, so it was reverted.

### Gap
Even after the fixes the story card is about 3.2 s warm, 4.4 s cold at x1, so about 13 to 18 s at x4 against 1.5 s. The card is 2 MP through runtime shaders on a CPU raster surface in wasm (chosen for identical pixels on every backend). Reaching 1.5 s at x4 (375 ms at x1) needs a change that moves pixels: a GPU (WebGL) surface for the card on web, or noise and grain at a lower resolution. That is a Director and panel decision. Not looks-changing but unfinished: the browser's own PNG encoder (OffscreenCanvas.convertToBlob, lossless, needs an in-browser pixel compare) for about 0.6 s at x1, and a Web Worker to keep the print off the main thread. The print guard was `test.fail` at 1500 ms; D-046 replaced it (see Guards after D-046).

### Guards after D-046 (committed head 167b731, export from a clean worktree, port 4196)
- Print: regression guard at x1, draw plus encode at most 1.5x the x1 baseline. Baseline on 167b731, two runs: 4618.5 ms (draw 3895.6 + encode 722.9) and 4290.8 ms (3580.1 + 710.7); recorded as 4620 ms, bound 6930 ms. The 1.5 s phone budget is measured at phone check 3 (D-034 remedy: cut card grain first).
- Scan: asserts p50 at or above 55 fps at x2; x4 is printed, never asserted.

| run | scan x1 p50 / p95 / mean | scan x2 p50 / p95 / mean | scan x4 p50 / p95 / mean | print x1 (draw + encode) |
|---|---|---|---|---|
| 1 | 16.7 / 16.8 / 17.4 ms (59.9 fps) | 16.7 / 66.7 / 28.9 ms (59.9 fps p50) | 33.4 / 150 / 60.2 ms (29.9 fps p50) | 4509.0 ms |
| 2 | 16.7 / 33.3 / 18.6 ms (59.9 fps) | 16.7 / 83.3 / 30.8 ms (59.9 fps p50) | 50.0 / 149.9 / 64.0 ms (20.0 fps p50) | 5131.1 ms |
| 3 | | 16.7 / 33.3 / 18.3 ms | 50.0 / 133.4 / 58.4 ms (20.0 fps p50) | 4618.5, 4290.8 ms (baseline runs) |

The x2 p50 holds at 59.9 fps but its mean is 29 to 31 ms: one frame in five to seven is late. Web Worker print: not attempted in this pass (needs CanvasKit in a worker with the fonts and photo transferred, plus the sha1 sweep to prove byte identity).

### Main thread during the scan theatre (for the joint pass with Builder A)
Measured with a throwaway probe (React DevTools hook counting commits and re-rendered components on an unminified export, WebGL/2D read-back counters, CDP tracing of a 3 s window), CPU x4, cellar fixture:
- The main thread is saturated: RunTask 3063 ms in a 3000 ms window. Split: JS (FunctionCall) 1652 ms, compositor Commit 619 ms, rAF callbacks 388 ms, Paint 183, Layerize 143, UpdateLayoutTree 113, PrePaint 111, Layout 99, UpdateLayer 90 ms.
- React: 150 to 203 commits in a 4.6 to 6.9 s theatre (about 30 per second over two roots: the app and Skia's reconciler), about 560 fibers re-rendered per commit. Per theatre: View 36461, Text 3721, LocaleProvider 2481, Screw 912, Pressable 758, DummyCap 629, PlateScrew 504, Wear 456, Key 379, MiniSticker/KeyRow/LedLadder 252 each, Housing/Nameplate/Glass 228 each, GlassOverlay/BurnIn 127, GrainCanvas/ScopeLayer/TheatreGlass 125, Trace 80.
- Read-back: 0 WebGL readPixels, 0 getImageData, 0 toDataURL during the theatre. The P3-09 per-redraw read-back named above does not run on the scan (the glass is the flat overlay there; the warp snapshot is boot and result only). The cost is re-rendering, not read-back.
- Proposals: (Builder A) memoise the housing (Housing, Nameplate, screws, Wear, MiniSticker, KeyRow and keys, LedLadder) so the 20 Hz scan clock re-renders only the readouts; pass stable props into Glass. (FX) drive ScopeLayer and the trace from a Reanimated shared value instead of React state so the 10 Hz trace and the sweep redraw without a commit; give GlassOverlay and BurnIn stable props (GlassOverlay is memo but re-renders 127 times, so a prop changes identity every render). Expected gain: most of the 1.65 s JS share; measure again with the same probe.
