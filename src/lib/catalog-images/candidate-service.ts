import "server-only";

import { selectProviderImageSource } from "@/lib/images/live-listing-image";
import type { PinduoduoGoods } from "@/lib/platforms/pinduoduo-client";
import type { LiveTaobaoOffer } from "@/lib/platforms/taobao-client";
import type { Product, ProductVariant } from "@/types/catalog";

import { SupabaseCatalogImageRepository } from "./repository";
import type {
  CatalogImageMatcher,
  CatalogImageMatchSignal,
  CreateCatalogImageCandidate,
  CreateCatalogImageCandidateResult,
} from "./types";

type MatchEvidence = Readonly<{
  matcher: CatalogImageMatcher;
  signals: readonly CatalogImageMatchSignal[];
}>;

export type CatalogImageCandidateMatch =
  | Readonly<{
    status: "matched";
    product: Product;
    /** Presence means a unique Variant match was completed. */
    variant?: ProductVariant;
    matchConfidence: number;
    evidence: MatchEvidence;
  }>
  | Readonly<{ status: "ambiguous" | "rejected" | "unmatched" }>;

export type CatalogImageCandidateSource =
  | Readonly<{ platform: "taobao"; listing: LiveTaobaoOffer }>
  | Readonly<{ platform: "pinduoduo"; listing: PinduoduoGoods }>;

export type CatalogImageCandidateOutcome = CreateCatalogImageCandidateResult | Readonly<{
  status: "skipped";
  reason: "ambiguous" | "rejected" | "unmatched" | "invalid_image" | "invalid_identity" | "invalid_match" | "invalid_target";
}>;

export interface CatalogImageCandidateRepository {
  createCandidateIfAbsent(input: CreateCatalogImageCandidate): Promise<CreateCatalogImageCandidateResult>;
}

const allowedMatchers = new Set<CatalogImageMatcher>([
  "taobao_phone_strict",
  "pinduoduo_phone_strict",
  "catalog_sync_deterministic",
]);
const allowedSignals = new Set<CatalogImageMatchSignal>([
  "brand", "model", "category", "storage", "color", "region", "condition",
]);

function uniqueSignals(signals: readonly CatalogImageMatchSignal[]): CatalogImageMatchSignal[] {
  return [...new Set(signals)];
}

function targetFor(match: Extract<CatalogImageCandidateMatch, { status: "matched" }>) {
  const productId = match.product.id.trim();
  if (!productId) return null;
  if (!match.variant) {
    return { productId, variantId: null, targetType: "product" as const };
  }
  const variantId = match.variant.id.trim();
  if (!variantId || match.variant.productId !== match.product.id
    || !match.product.variants.some((variant) => variant.id === match.variant?.id)) return null;
  return { productId, variantId, targetType: "variant" as const };
}

function candidateSource(source: CatalogImageCandidateSource) {
  if (source.platform === "taobao") {
    const externalProductId = source.listing.itemId.trim();
    if (!externalProductId || source.listing.variantId !== null) return null;
    const selected = selectProviderImageSource("taobao", [
      { kind: "pict_url", url: source.listing.pictUrl },
      { kind: "small_images_0", url: source.listing.smallImages[0] },
    ]);
    return selected ? {
      platform: "taobao",
      externalProductId,
      externalVariantId: null,
      sourceKind: selected.kind,
      sourceUrl: selected.url,
    } : null;
  }

  const externalProductId = source.listing.goodsId.trim();
  if (!externalProductId) return null;
  const selected = selectProviderImageSource("pinduoduo", [
    { kind: "goods_image_url", url: source.listing.goodsImageUrl },
    { kind: "goods_thumbnail_url", url: source.listing.goodsThumbnailUrl },
  ]);
  return selected ? {
    platform: "pdd",
    externalProductId,
    // goodsSign is a product access signature, not a verified SKU identifier.
    externalVariantId: null,
    sourceKind: selected.kind,
    sourceUrl: selected.url,
  } : null;
}

export async function createCatalogImageCandidate(
  input: Readonly<{ source: CatalogImageCandidateSource; match: CatalogImageCandidateMatch }>,
  repository: CatalogImageCandidateRepository = new SupabaseCatalogImageRepository(),
): Promise<CatalogImageCandidateOutcome> {
  if (input.match.status !== "matched") {
    return { status: "skipped", reason: input.match.status };
  }
  if (!Number.isFinite(input.match.matchConfidence)
    || input.match.matchConfidence < 0 || input.match.matchConfidence > 1
    || !allowedMatchers.has(input.match.evidence.matcher)
    || input.match.evidence.signals.length === 0
    || input.match.evidence.signals.some((signal) => !allowedSignals.has(signal))) {
    return { status: "skipped", reason: "invalid_match" };
  }
  const target = targetFor(input.match);
  if (!target) return { status: "skipped", reason: "invalid_target" };
  const source = candidateSource(input.source);
  if (!source) {
    const hasIdentity = input.source.platform === "taobao"
      ? Boolean(input.source.listing.itemId.trim())
      : Boolean(input.source.listing.goodsId.trim());
    return { status: "skipped", reason: hasIdentity ? "invalid_image" : "invalid_identity" };
  }
  return repository.createCandidateIfAbsent({
    ...target,
    ...source,
    matchConfidence: input.match.matchConfidence,
    matchEvidence: {
      schemaVersion: 1,
      matcher: input.match.evidence.matcher,
      matchLevel: target.targetType,
      signals: uniqueSignals(input.match.evidence.signals),
    },
  });
}
