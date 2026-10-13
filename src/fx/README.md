# src/fx

Visual effects. `ghostV0/` is the P2 ghost compositor, built on plain RN `Image` and `View`
so it runs before Skia lands. P3 swaps the internals; the props stay.

## ghostV0: what it does
- `regionFromImage(uri)` -> `{ region, meanLuma } | null`. Web: canvas `getImageData`,
  `downsampleLuma` to 96 px, `findDarkRegion`. Native: `null` until Skia (P3).
- `placeGhost(region | null, frame, seed, { opacityRange? })` -> `Placement`. Pure, seeded, tested.
  Figure plus motion copies cover at most 15% of the frame, centre 10 to 30% of the region size
  off the centroid and inside the region box, never within 8% of the frame midline, opacity
  0.08 to 0.25, 3 to 5 offset copies along one drift direction at falling alpha. No region:
  lower third, left or right of the midline.
- `ghostTint(meanLuma, placement)` -> neutral grey set so the stacked peak lands about
  `PEAK_LIFT` (14 luma) above the region mean: the brightness clamp under normal alpha.
- `<GhostV0 placement regionMeanLuma />` draws the matte copies, absolutely positioned, tinted
  grey, inside an absolute-fill view laid over the photo. Mattes: `assets/ghost/matte-{1,2,3}.png`
  from `scripts/gen-ghost-mattes.mjs` (seeded, no source images).

## Stable contract (P3 keeps these)
- `placeGhost` signature and the `Placement` shape (pixels in the photo view's space).
- `<GhostV0 placement regionMeanLuma />` props; P3 may add an optional `photo` prop for the
  grain pass but must not require new ones.
- `regionFromImage(uri): Promise<{ region, meanLuma } | null>`.

## What P3 replaces
- Normal alpha blend -> Skia Screen or Plus blend mode.
- Offset copies -> real Gaussian blur on the ghost (more than the scene) plus directional blur.
- Baked noise in the matte -> live FractalNoise mask for feathering, displacement per photo.
- No grain today -> one grain pass applied after compositing, over photo and ghost together.
- Native `regionFromImage` -> Skia raster image read back on the device.
- Brightness clamp by tint -> a shader clamp against the region mean.
