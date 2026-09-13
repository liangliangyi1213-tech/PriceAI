import "server-only";

import { selectProviderImageSource, type LiveImagePlatform } from "@/lib/images/live-listing-image";

import { SupabaseCatalogImageRepository } from "./repository";
import type { CatalogImage, CatalogImageMatchSignal, CatalogImageMatcher } from "./types";

const KEEP_LIMIT = 3;
const allowedMatchers = new Set<CatalogImageMatcher>([
  "taobao_phone_strict",
  "pinduoduo_phone_strict",
  "catalog_sync_deterministic",
]);
const allowedSignals = new Set<CatalogImageMatchSignal>([
  "brand", "model", "category", "storage", "color", "region", "condition",
]);

export type CatalogImageGovernanceBasis = Readonly<{
  confidence: number | null;
  evidenceComplete: boolean;
  evidenceSignalCount: number;
  sourceQuality: "preferred" | "fallback" | "other" | "invalid";
  lastSeenAt: string | null;
  firstSeenAt: string | null;
}>;

export type CatalogImageGovernanceReport = Readonly<{
  activeCount: number;
  keepCount: number;
  suggestedCleanupCount: number;
  items: readonly Readonly<{
    rank: number;
    recommendation: "keep" | "suggested_cleanup";
    basis: CatalogImageGovernanceBasis;
  }>[];
}>;

type RankedCandidate = Readonly<{ image: CatalogImage; basis: CatalogImageGovernanceBasis }>;

function finiteConfidence(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function evidenceBasis(image: CatalogImage): Pick<CatalogImageGovernanceBasis, "evidenceComplete" | "evidenceSignalCount"> {
  const evidence = image.matchEvidence;
  const matcher = evidence?.matcher;
  const signals = Array.isArray(evidence?.signals)
    ? [...new Set(evidence.signals.filter((signal): signal is CatalogImageMatchSignal => (
      typeof signal === "string" && allowedSignals.has(signal as CatalogImageMatchSignal)
    )))]
    : [];
  return {
    evidenceComplete: evidence?.schemaVersion === 1
      && typeof matcher === "string"
      && allowedMatchers.has(matcher as CatalogImageMatcher)
      && evidence?.matchLevel === image.targetType
      && signals.length > 0,
    evidenceSignalCount: signals.length,
  };
}

function imagePlatform(platform: string): LiveImagePlatform | null {
  if (platform === "taobao") return "taobao";
  if (platform === "pdd") return "pinduoduo";
  return null;
}

function sourceQuality(image: CatalogImage): CatalogImageGovernanceBasis["sourceQuality"] {
  const platform = imagePlatform(image.platform);
  if (!platform || !selectProviderImageSource(platform, [{ kind: image.sourceKind, url: image.sourceUrl }])) {
    return "invalid";
  }
  if ((platform === "taobao" && image.sourceKind === "pict_url")
    || (platform === "pinduoduo" && image.sourceKind === "goods_image_url")) return "preferred";
  if ((platform === "taobao" && image.sourceKind === "small_images_0")
    || (platform === "pinduoduo" && image.sourceKind === "goods_thumbnail_url")) return "fallback";
  return "other";
}

function safeTime(value: string): { epoch: number | null; iso: string | null } {
  const epoch = new Date(value).valueOf();
  return Number.isFinite(epoch) ? { epoch, iso: new Date(epoch).toISOString() } : { epoch: null, iso: null };
}

function rankingBasis(image: CatalogImage): CatalogImageGovernanceBasis {
  const lastSeen = safeTime(image.lastSeenAt);
  const firstSeen = safeTime(image.firstSeenAt);
  return {
    confidence: finiteConfidence(image.matchConfidence),
    ...evidenceBasis(image),
    sourceQuality: sourceQuality(image),
    lastSeenAt: lastSeen.iso,
    firstSeenAt: firstSeen.iso,
  };
}

const sourceRank: Record<CatalogImageGovernanceBasis["sourceQuality"], number> = {
  preferred: 3,
  fallback: 2,
  other: 1,
  invalid: 0,
};

function compareRanked(left: RankedCandidate, right: RankedCandidate): number {
  const confidence = (right.basis.confidence ?? -1) - (left.basis.confidence ?? -1);
  if (confidence !== 0) return confidence;
  if (left.basis.evidenceComplete !== right.basis.evidenceComplete) return left.basis.evidenceComplete ? -1 : 1;
  if (left.basis.evidenceSignalCount !== right.basis.evidenceSignalCount) {
    return right.basis.evidenceSignalCount - left.basis.evidenceSignalCount;
  }
  const source = sourceRank[right.basis.sourceQuality] - sourceRank[left.basis.sourceQuality];
  if (source !== 0) return source;
  const lastSeen = (Date.parse(right.basis.lastSeenAt ?? "") || -1) - (Date.parse(left.basis.lastSeenAt ?? "") || -1);
  if (lastSeen !== 0) return lastSeen;
  const firstSeen = (Date.parse(left.basis.firstSeenAt ?? "") || Number.MAX_SAFE_INTEGER)
    - (Date.parse(right.basis.firstSeenAt ?? "") || Number.MAX_SAFE_INTEGER);
  if (firstSeen !== 0) return firstSeen;
  // Internal identity is only the final deterministic tie-breaker. It never contributes to quality or output.
  return left.image.id < right.image.id ? -1 : left.image.id > right.image.id ? 1 : 0;
}

function rankedActiveCandidates(
  images: readonly CatalogImage[],
  scope?: Readonly<{ productId: string; platform: string }>,
): RankedCandidate[] {
  return images
    .filter((image) => image.status === "candidate"
      && (!scope || (image.productId === scope.productId && image.platform === scope.platform)))
    .map((image): RankedCandidate => ({ image, basis: rankingBasis(image) }))
    .sort(compareRanked);
}

/** Server-only cleanup input. Candidate identities from this function must never cross the service boundary. */
export function selectSuggestedCleanupCatalogImages(
  images: readonly CatalogImage[],
  scope?: Readonly<{ productId: string; platform: string }>,
): CatalogImage[] {
  return rankedActiveCandidates(images, scope).slice(KEEP_LIMIT).map((candidate) => candidate.image);
}

export function analyzeCatalogImageCandidateOverCap(
  images: readonly CatalogImage[],
  scope?: Readonly<{ productId: string; platform: string }>,
): CatalogImageGovernanceReport {
  const active = rankedActiveCandidates(images, scope);
  const keepCount = Math.min(KEEP_LIMIT, active.length);
  return {
    activeCount: active.length,
    keepCount,
    suggestedCleanupCount: Math.max(0, active.length - keepCount),
    items: active.map((candidate, index) => ({
      rank: index + 1,
      recommendation: index < KEEP_LIMIT ? "keep" : "suggested_cleanup",
      basis: candidate.basis,
    })),
  };
}

export async function analyzeActiveCatalogImageCandidateOverCap(
  productId: string,
  platform: string,
  repository: Pick<SupabaseCatalogImageRepository, "getActiveCandidates"> = new SupabaseCatalogImageRepository(),
): Promise<CatalogImageGovernanceReport> {
  const candidates = await repository.getActiveCandidates(productId, platform);
  return analyzeCatalogImageCandidateOverCap(candidates, { productId, platform });
}
