export { mapProductImageRow } from "./mapper";
export { resolveCatalogImage } from "./resolver";
export { createCatalogImageCandidate } from "./candidate-service";
export { enqueueCatalogImageMirrorJob, runNextCatalogImageMirrorJob } from "./mirror-job-service";
export { promoteCatalogImagePrimaryAndSchedule } from "./promotion-orchestration";
export {
  approveCatalogImageCandidate,
  CatalogImageReviewError,
  promoteCatalogImagePrimary,
  rejectCatalogImageCandidate,
} from "./review-service";
export type {
  CatalogImage,
  CatalogImagePrimaryEvent,
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
export type {
  ApprovedCandidateInput,
  CatalogImageReviewContext,
  CatalogImageReviewFailure,
  CatalogImageReviewRepository,
  PrimaryPromotionAction,
  PrimaryPromotionResult,
  PromotePrimaryInput,
} from "./review-service";
