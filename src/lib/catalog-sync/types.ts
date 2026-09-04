import type { MarketplaceId, PlatformAdapterId, PlatformSearchResult } from "@/lib/platforms/types";
import type { Product, ProductVariant } from "@/types/catalog";

export type NormalizedPlatformProduct = {
  platform: MarketplaceId;
  externalProductId: string;
  externalVariantId: string | null;
  title: string;
  normalizedTitle: string;
  brand: string | null;
  model: string | null;
  storage: string | null;
  color: string | null;
  price: number;
  originalPrice: number | null;
  currency: "CNY";
  shopName: string;
  rating: number | null;
  sales: number | null;
  imageUrl: string | null;
  productUrl: string | null;
  collectedAt: string;
};

export type NormalizationRejection = { input: PlatformSearchResult; reason: string };
export type NormalizationResult =
  | { ok: true; value: NormalizedPlatformProduct }
  | { ok: false; rejection: NormalizationRejection };

export type MatchedOffer = {
  normalized: NormalizedPlatformProduct;
  product: Product;
  variant: ProductVariant;
  offerIdentity: string;
};

export type CatalogSyncPlan = {
  matchedOffers: MatchedOffer[];
  unmatchedItems: NormalizedPlatformProduct[];
  ambiguousItems: NormalizedPlatformProduct[];
  rejectedItems: NormalizationRejection[];
  summary: { input: number; normalized: number; rejected: number; matched: number; unmatched: number; ambiguous: number };
};

export type CatalogSyncWriteInput = MatchedOffer;
export type SnapshotWriteResult = { recorded: boolean };

/** Server-only boundary. Implementations must never be imported by Client Components. */
export interface CatalogSyncWriter {
  upsertOffer(input: CatalogSyncWriteInput): Promise<void>;
  recordPriceSnapshotIfNeeded(input: CatalogSyncWriteInput): Promise<SnapshotWriteResult>;
}

export type CatalogSyncResult = {
  plan: CatalogSyncPlan;
  persisted: number;
  snapshotsRecorded: number;
  writeFailures: Array<{ offerIdentity: string; message: string }>;
};

export type CatalogSyncRunInput = {
  platform: PlatformAdapterId;
  query: string;
  dryRun: boolean;
  collectedAt?: string;
};

export type CatalogSyncPreview = {
  platform: PlatformAdapterId;
  query: string;
  fetchedCount: number;
  matchedCount: number;
  unmatchedCount: number;
  ambiguousCount: number;
  rejectedCount: number;
  offerUpserts: number;
  priceHistorySnapshots: number;
  matchedItems: Array<{ offerIdentity: string; productId: string; variantId: string; platform: MarketplaceId; price: number }>;
  unmatchedItems: Array<{ platform: MarketplaceId; externalProductId: string; title: string }>;
  ambiguousItems: Array<{ platform: MarketplaceId; externalProductId: string; title: string }>;
  rejectedItems: Array<{ platform: MarketplaceId; externalProductId: string; reason: string }>;
};

export type CatalogSyncRunResult = { runId: string; dryRun: boolean; preview: CatalogSyncPreview; syncResult?: CatalogSyncResult };

export type CatalogSyncRunStatus = "running" | "success" | "partial_failure" | "failed";
export type CatalogSyncRunHandle = { id: string; startedAt: string };
export type CompleteCatalogSyncRunInput = {
  status: "success" | "partial_failure";
  fetchedCount: number; matchedCount: number; unmatchedCount: number; ambiguousCount: number; rejectedCount: number;
  offerUpsertCount: number; priceSnapshotCount: number; writeFailureCount: number;
  finishedAt: string; durationMs: number;
};
export type FailCatalogSyncRunInput = { code: string; summary: string; finishedAt: string; durationMs: number };
export interface CatalogSyncRunRepository {
  createCatalogSyncRun(input: { platform: PlatformAdapterId; query: string; dryRun: boolean; startedAt: string }): Promise<CatalogSyncRunHandle>;
  completeCatalogSyncRun(id: string, input: CompleteCatalogSyncRunInput): Promise<void>;
  failCatalogSyncRun(id: string, input: FailCatalogSyncRunInput): Promise<void>;
}
