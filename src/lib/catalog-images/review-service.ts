import "server-only";

import { createHash } from "node:crypto";

import {
  defaultCatalogImageSourceRegistry,
  isCatalogImageMatcherAllowed,
  isCatalogImageSourceKindAllowed,
  selectCatalogImageSource,
  type CatalogImageSourceRegistry,
} from "./catalog-image-source";
import { SupabaseCatalogImageRepository } from "./repository";
import type { CatalogImage, CatalogImageMatchSignal, CatalogImageMatcher } from "./types";

export type CatalogImageReviewFailure =
  | "not_found"
  | "not_candidate"
  | "not_approved"
  | "target_invalid"
  | "source_not_allowed"
  | "source_identity_invalid"
  | "match_evidence_invalid"
  | "review_metadata_invalid"
  | "promotion_conflict";

export class CatalogImageReviewError extends Error {
  constructor(readonly code: CatalogImageReviewFailure) {
    super("Catalog image review could not be completed.");
    this.name = "CatalogImageReviewError";
  }
}

export type CatalogImageReviewContext = Readonly<{
  image: CatalogImage;
  productExists: boolean;
  variantBelongsToProduct: boolean;
}>;

export type PrimaryPromotionAction = "initial" | "replace" | "rollback";
export type PrimaryPromotionResult = Readonly<{
  imageId: string;
  previousImageId: string | null;
  action: PrimaryPromotionAction;
  eventId: string;
}>;

export type ApprovedCandidateInput = Readonly<{
  imageId: string;
  reviewer: string;
  reviewMethod: "manual" | "manual_cross_check";
  verifiedAt: string;
  matchConfidence: number;
  matchEvidence: Record<string, unknown>;
}>;

export type PromotePrimaryInput = Readonly<{
  imageId: string;
  action: PrimaryPromotionAction;
  reviewer: string;
  reason: string;
}>;

export interface CatalogImageReviewRepository {
  getReviewContext(imageId: string): Promise<CatalogImageReviewContext | null>;
  approveCandidate(input: ApprovedCandidateInput): Promise<CatalogImage>;
  rejectCandidate(input: { imageId: string; reason: string }): Promise<boolean>;
  promotePrimary(input: PromotePrimaryInput): Promise<PrimaryPromotionResult>;
}

const allowedMatchers = new Set<CatalogImageMatcher>([
  "taobao_phone_strict", "pinduoduo_phone_strict", "catalog_sync_deterministic", "priceai_fixture_deterministic",
]);
const allowedSignals = new Set<CatalogImageMatchSignal>([
  "brand", "model", "category", "storage", "color", "region", "condition",
]);

function nonEmpty(value: string, maxLength: number): boolean {
  const length = value.trim().length;
  return length > 0 && length <= maxLength;
}

function validEvidence(
  image: CatalogImage,
  sourceRegistry: CatalogImageSourceRegistry,
): image is CatalogImage & { matchEvidence: Record<string, unknown>; matchConfidence: number } {
  const evidence = image.matchEvidence;
  if (!evidence || image.matchConfidence === null || !Number.isFinite(image.matchConfidence)
    || image.matchConfidence < 0 || image.matchConfidence > 1) return false;
  const matcher = evidence.matcher;
  const signals = evidence.signals;
  return evidence.schemaVersion === 1
    && allowedMatchers.has(matcher as CatalogImageMatcher)
    && isCatalogImageMatcherAllowed(image.platform, matcher as CatalogImageMatcher, sourceRegistry)
    && evidence.matchLevel === image.targetType
    && Array.isArray(signals)
    && signals.length > 0
    && signals.every((signal) => typeof signal === "string" && allowedSignals.has(signal as CatalogImageMatchSignal));
}

function validSource(image: CatalogImage, sourceRegistry: CatalogImageSourceRegistry): CatalogImageReviewFailure | null {
  if (!isCatalogImageSourceKindAllowed(image.platform, image.sourceKind, sourceRegistry)) return "source_not_allowed";
  const selected = selectCatalogImageSource(image.platform, image.sourceUrl, sourceRegistry);
  if (!selected) return "source_not_allowed";
  const source = new URL(selected.url);
  const expectedHash = createHash("sha256").update(selected.url).digest("hex");
  if (!image.externalProductId.trim()
    || (image.platform === "taobao" && image.externalVariantId !== null)
    || image.sourceHost !== source.hostname.toLowerCase()
    || image.sourceUrl !== selected.url
    || image.sourceUrlHash !== expectedHash) {
    return "source_identity_invalid";
  }
  return null;
}

function validateCandidate(
  context: CatalogImageReviewContext,
  sourceRegistry: CatalogImageSourceRegistry,
): CatalogImageReviewFailure | null {
  const { image } = context;
  if (!context.productExists) return "target_invalid";
  const targetIsValid = image.targetType === "product"
    ? image.variantId === null
    : image.variantId !== null && context.variantBelongsToProduct;
  if (!targetIsValid) return "target_invalid";
  const sourceFailure = validSource(image, sourceRegistry);
  if (sourceFailure) return sourceFailure;
  return validEvidence(image, sourceRegistry) ? null : "match_evidence_invalid";
}

export async function approveCatalogImageCandidate(
  input: Readonly<{
    imageId: string;
    reviewer: string;
    reviewMethod: "manual" | "manual_cross_check";
    verifiedAt?: string;
  }>,
  repository: CatalogImageReviewRepository = new SupabaseCatalogImageRepository(),
  options: Readonly<{ sourceRegistry?: CatalogImageSourceRegistry }> = {},
): Promise<CatalogImage | Readonly<{ status: "rejected"; reason: CatalogImageReviewFailure }>> {
  if (!nonEmpty(input.imageId, 100) || !nonEmpty(input.reviewer, 120)) {
    throw new CatalogImageReviewError("review_metadata_invalid");
  }
  const verifiedAt = input.verifiedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(verifiedAt))) throw new CatalogImageReviewError("review_metadata_invalid");
  const context = await repository.getReviewContext(input.imageId.trim());
  if (!context) throw new CatalogImageReviewError("not_found");
  if (context.image.status !== "candidate") throw new CatalogImageReviewError("not_candidate");
  const failure = validateCandidate(context, options.sourceRegistry ?? defaultCatalogImageSourceRegistry);
  if (failure) {
    const rejected = await repository.rejectCandidate({ imageId: context.image.id, reason: failure });
    if (!rejected) throw new CatalogImageReviewError("not_candidate");
    return { status: "rejected", reason: failure };
  }
  const matchConfidence = context.image.matchConfidence;
  const matchEvidence = context.image.matchEvidence;
  if (matchConfidence === null || matchEvidence === null) {
    throw new CatalogImageReviewError("match_evidence_invalid");
  }
  return repository.approveCandidate({
    imageId: context.image.id,
    reviewer: input.reviewer.trim(),
    reviewMethod: input.reviewMethod,
    verifiedAt: new Date(verifiedAt).toISOString(),
    matchConfidence,
    matchEvidence,
  });
}

export async function rejectCatalogImageCandidate(
  input: Readonly<{ imageId: string; reviewer: string; reason: string }>,
  repository: CatalogImageReviewRepository = new SupabaseCatalogImageRepository(),
): Promise<void> {
  if (!nonEmpty(input.imageId, 100) || !nonEmpty(input.reviewer, 120) || !nonEmpty(input.reason, 500)) {
    throw new CatalogImageReviewError("review_metadata_invalid");
  }
  const context = await repository.getReviewContext(input.imageId.trim());
  if (!context) throw new CatalogImageReviewError("not_found");
  if (context.image.status !== "candidate") throw new CatalogImageReviewError("not_candidate");
  const rejected = await repository.rejectCandidate({
    imageId: context.image.id,
    reason: input.reason.trim(),
  });
  if (!rejected) throw new CatalogImageReviewError("not_candidate");
}

export async function promoteCatalogImagePrimary(
  input: Readonly<{
    imageId: string;
    action: PrimaryPromotionAction;
    reviewer: string;
    reason: string;
  }>,
  repository: CatalogImageReviewRepository = new SupabaseCatalogImageRepository(),
): Promise<PrimaryPromotionResult> {
  if (!nonEmpty(input.imageId, 100) || !nonEmpty(input.reviewer, 120) || !nonEmpty(input.reason, 500)) {
    throw new CatalogImageReviewError("review_metadata_invalid");
  }
  const context = await repository.getReviewContext(input.imageId.trim());
  if (!context) throw new CatalogImageReviewError("not_found");
  if (context.image.status !== "approved") throw new CatalogImageReviewError("not_approved");
  if (!context.productExists || (context.image.targetType === "variant" && !context.variantBelongsToProduct)) {
    throw new CatalogImageReviewError("target_invalid");
  }
  return repository.promotePrimary({
    imageId: context.image.id,
    action: input.action,
    reviewer: input.reviewer.trim(),
    reason: input.reason.trim(),
  });
}
