/** Identifies an integration implementation, not a PriceAI Offer record. */
export type PlatformAdapterId = "mock" | "jd" | "taobao" | "pdd";

/** Identifies the marketplace that supplied a normalized external result. */
export type MarketplaceId = Exclude<PlatformAdapterId, "mock">;

export type PlatformSearchSort = "relevance" | "price_asc" | "price_desc";

export type PlatformSearchOptions = {
  limit?: number;
  page?: number;
  sort?: PlatformSearchSort;
  minPrice?: number;
  maxPrice?: number;
};

/**
 * This is an external-platform result after an adapter has normalized it.
 * It intentionally is not PriceAI's Product / ProductVariant / Offer model.
 */
export type PlatformSearchResult = {
  platform: MarketplaceId;
  externalProductId: string;
  externalVariantId?: string;
  title: string;
  price: number;
  originalPrice?: number;
  imageUrl?: string;
  shopName: string;
  sales?: number;
  rating?: number;
  promotion?: {
    originalPrice: number;
  };
  productUrl: string;
};

export type PlatformProductDetail = PlatformSearchResult & {
  description?: string;
  specifications?: Record<string, string>;
};

export interface PlatformAdapter {
  readonly id: PlatformAdapterId;
  searchProducts(query: string, options?: PlatformSearchOptions): Promise<PlatformSearchResult[]>;
  getProductDetail?(externalProductId: string): Promise<PlatformProductDetail | null>;
}
