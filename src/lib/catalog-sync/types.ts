import type { MarketplaceId, PlatformSearchResult } from "@/lib/platforms/types";
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
