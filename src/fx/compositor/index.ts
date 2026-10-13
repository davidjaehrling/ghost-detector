export { Composite, wantsCompositorV1, type CompositeProps, type PhotoRect } from './Composite';
export { regionFromImage, type RegionStats } from './regionFromImage';
export { statsFromRgba, statsFromLuma, lumaUnder, halvingSteps, estimateP80, REGION_GRID, type LumaGrid } from './regionStats';
export { reference, unionBox, type Reference, type ReferenceInput } from './reference';
export { buildGhostLayer } from './ghostLayer';
export { motionCopies, ghostBlurSigma, GHOST_BLUR, SMUDGE_BLUR, MIN_COPIES, MAX_COPIES } from './motion';
export { compositePixel, plusClamped, occlusion, grainOffset, luma, CLAMP_LIFT, KNEE, OCC_RAMP, GRAIN, COMPOSITE_SKSL } from './blend';
