export { mapProductImageRow } from "./mapper";
export { resolveCatalogImage } from "./resolver";
export { createCatalogImageCandidate } from "./candidate-service";
export type {
  CatalogImage,
  CatalogImageResolution,
  CatalogImageRole,
  CatalogImageStatus,
  CatalogImageTargetType,
  CatalogImageMatcher,
  CatalogImageMatchSignal,
} from "./types";
export type {
  CatalogImageCandidateMatch,
  CatalogImageCandidateOutcome,
  CatalogImageCandidateRepository,
  CatalogImageCandidateSource,
} from "./candidate-service";
