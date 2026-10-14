# Performance budget: FX half (P8-03)

Owner: FX Engineer. For Builder A to fold into `docs/perf.md`.

## Method
- Guard: `e2e/web/perf-fx.spec.ts`, 390 x 844 only, CPU throttle via CDP `Emulation.setCPUThrottlingRate` (x4 default, `FX_CPU_RATE=1` for the reference run). Numbers print as `[perf-fx] ...` lines in the CI log.
- Scan theatre: the FX frame counter `src/fx/perf` (`window.__fxFrames`, installed on web by `Glass`, idle until started). The spec opens `/viewfinder?fixture=cellar`, settles 2.5 s, presses CAPTURE, starts the counter when the scan bar shows and stops it in a MutationObserver the moment the result screen attaches (the route change is excluded). Budget: p50 at or above 55 fps (p50 frame time at or under 18.2 ms); p95 recorded.
- Print: `/share-probe?static=1&format=story&case=critical-deep&fixture=cellar`; `renderShareCard` now returns `ms: { load, draw, encode, save, total }`, the probe exposes them as `data-ms-*`. Budget: draw plus encode under 1500 ms.
- Profile: CanvasKit in Node (the share card unit-test harness), each canvas call timed.

## Measured (headless Chromium, SwiftShader, shared 4-core machine, load 2 to 6)
| what | x1 | x4 |
|---|---|---|
| scan p50 / p95 / max frame | 16.7 / 16.7 / 50.1 ms (59.9 fps, 506 frames) | run 1: 33.3 / 83.4 / 116.8 ms (30.0 fps); run 2: 16.8 / 83.4 / 133.3 ms (59.5 fps at p50, 29.2 fps mean) |
| print draw + encode, before P8-03 | 6517 + 750 = 7267 ms | 25830 + 3040 = 28870 ms (load 460, save 447) |

At x4 the scan p50 sits on the 16.7/33.3 ms edge: it passed one run and failed the other. The mean is about 29 fps, so frames do drop under throttle; the cost is the main thread (React re-renders on the 20 Hz scan clock and the 10 Hz trace, plus the per-redraw GPU read-back from P3-09), not one shader.

## Print: what costs what (story card, Node CanvasKit, about x1)
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

## Gap
Even after the fixes the story card is about 3.2 s warm, 4.4 s cold at x1, so about 13 to 18 s at x4 against 1.5 s. The card is 2 MP through runtime shaders on a CPU raster surface in wasm (chosen for identical pixels on every backend). Reaching 1.5 s at x4 (375 ms at x1) needs a change that moves pixels: a GPU (WebGL) surface for the card on web, or noise and grain at a lower resolution. That is a Director and panel decision. Not looks-changing but unfinished: the browser's own PNG encoder (OffscreenCanvas.convertToBlob, lossless, needs an in-browser pixel compare) for about 0.6 s at x1, and a Web Worker to keep the print off the main thread. The print guard is `test.fail` (expected fail) at the unchanged 1500 ms threshold.
