/** Identifies an integration implementation, not a PriceAI Offer record. */
export type PlatformAdapterId = "mock" | "jd" | "taobao" | "pdd";

/** Identifies the marketplace that supplied a normalized external result. */
export type MarketplaceId = Exclude<PlatformAdapterId, "mock">;

export type PlatformSearchSort = "relevance" | "price_asc" | "price_desc";
export type CatalogSyncCapability = "full_offer" | "product_only";
export type PlatformResultProvenance = "mock" | "live_platform" | "unknown";
export type PlatformIndicatorUsage =
  | "display"
  | "sort"
  | "filter"
  | "compare"
  | "score"
  | "ai"
  | "persist_as_sales";

/** Provider-specific context that must never be treated as ordinary consumer sales. */
export type PlatformIndicator =
  | Readonly<{
      kind: "pdd_sales_tip";
      displayText: string;
      usage: "display_only";
    }>
  | Readonly<{
      kind: "pdd_realtime_sales_tip";
      displayText: string;
      usage: "display_only";
    }>
  | Readonly<{
      kind: "taobao_annual_volume";
      displayText: string;
      numericValue?: number;
      period: "annual";
      usage: "display_only";
    }>
  | Readonly<{
      kind: "taobao_affiliate_promotion_30d";
      value: number;
      period: "last_30_days";
      usage: "display_only";
    }>;

export type PlatformSearchOptions = {
  limit?: number;
  page?: number;
  sort?: PlatformSearchSort;
  minPrice?: number;
  maxPrice?: number;
  /** Provider category identifier selected by the server-side category registry. */
  categoryId?: string;
};

/**
 * This is an external-platform result after an adapter has normalized it.
 * It intentionally is not PriceAI's Product / ProductVariant / Offer model.
 */
export type PlatformSearchResult = {
  /** Explicit adapter capability identity; never inferred from marketplace. */
  provenance?: PlatformResultProvenance;
  platform: MarketplaceId;
  externalProductId: string;
  externalVariantId?: string;
  title: string;
  price: number;
  originalPrice?: number;
  imageUrl?: string;
  shopName: string;
  /** Reserved for a future verified ordinary consumer-sales fact. */
  sales?: number;
  rating?: number;
  providerIndicators?: readonly PlatformIndicator[];
  promotion?: {
    originalPrice: number;
  };
  productUrl: string;
  sourceMetadata?: Record<string, string | number | boolean | null>;
  /** Provider-supplied structured attributes. Titles never qualify for this field. */
  variantEvidence?: Readonly<{
    source: "structured";
    attributes: Readonly<Record<string, string>>;
  }>;
};

export type PlatformProductDetail = PlatformSearchResult & {
  description?: string;
  specifications?: Record<string, string>;
};

export interface PlatformAdapter {
  readonly id: PlatformAdapterId;
  /** Product-only integrations must never enter the SKU Offer writer. */
  readonly catalogSyncCapability?: CatalogSyncCapability;
  searchProducts(query: string, options?: PlatformSearchOptions): Promise<PlatformSearchResult[]>;
  getRecommendedProducts?(options?: PlatformSearchOptions): Promise<PlatformSearchResult[]>;
  getProductDetail?(externalProductId: string): Promise<PlatformProductDetail | null>;
}
