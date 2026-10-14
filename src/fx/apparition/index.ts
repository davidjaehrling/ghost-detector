export {
  APPARITION_ASPECT,
  VARIANT_COUNT,
  VARIANT_NAMES,
  OCCLUDED_VARIANTS,
  FIT_W,
  FIT_H,
  imageRectFor,
  buildSilhouette,
  coverageAt,
  type Silhouette,
  type Part,
  type Pt,
} from './shape';
export {
  alphaGrid,
  areaFraction,
  mirrorCorrelation,
  largestHoleFraction,
  silhouetteMetrics,
  maskAlpha,
  SILHOUETTE_ALPHA,
  type AlphaGrid,
  type SilhouetteMetrics,
} from './metrics';
export { renderApparition, drawSilhouette, makeSurface, snapshot, polysToPath, type ApparitionRequest } from './render';
