export { Composite, wantsCompositorV1, POP_ALPHA, POP_LIFT, type CompositeInfo, type CompositeProps, type PhotoRect } from './Composite';
export { regionFromImage, type RegionStats } from './regionFromImage';
export { statsFromRgba, statsFromLuma, lumaUnder, occlusionGrid, halvingSteps, estimateP80, REGION_GRID, type LumaGrid } from './regionStats';
export { reference, unionBox, adaptOcclusion, cellsUnderFigure, cutShare, OCC_CUT_MIN, OCC_CUT_TARGET, OCC_RAMP_MIN, type Reference, type ReferenceInput } from './reference';
export { buildGhostLayer } from './ghostLayer';
export { motionCopies, ghostBlurSigma, smearFor, GHOST_BLUR, SMUDGE_BLUR, MIN_COPIES, MAX_COPIES, SMEAR_PX, SMEAR_STEPS } from './motion';
export { compositePixel, plusClamped, occlusion, grainOffset, luma, CLAMP_LIFT, GAMMA, OCC_GRID_BLUR, OCC_RAMP, GRAIN, COMPOSITE_SKSL } from './blend';
export { autoGain, NO_GAIN, GAIN_TARGET, GAIN_STEP_DB, GAIN_MAX_DB, type AutoGain } from './autoGain';
export { PHOTO_TINT, BRIGHT_TINT, BRIGHT_SCENE, tintFor } from './setup';
