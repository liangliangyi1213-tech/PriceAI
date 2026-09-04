import { searchProducts } from "@/lib/search/products";
import type { Offer, Product } from "@/types/catalog";

import type {
  MarketplaceId,
  PlatformAdapter,
  PlatformSearchOptions,
  PlatformSearchResult,
  PlatformSearchSort,
} from "./types";

const offerPlatformMap: Record<"京东" | "淘宝" | "拼多多", MarketplaceId> = {
  京东: "jd",
  淘宝: "taobao",
  拼多多: "pdd",
};

function toPositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}

function sortResults(results: PlatformSearchResult[], sort: PlatformSearchSort | undefined): PlatformSearchResult[] {
  if (sort === "price_asc") return [...results].sort((left, right) => left.price - right.price);
  if (sort === "price_desc") return [...results].sort((left, right) => right.price - left.price);
  return results;
}

function normalizeOffer(product: Product, offer: Offer): PlatformSearchResult {
  return {
    platform: offerPlatformMap[offer.platform as keyof typeof offerPlatformMap],
    externalProductId: product.id,
    externalVariantId: offer.variantId,
    title: offer.title,
    price: offer.price,
    originalPrice: offer.originalPrice,
    imageUrl: product.image,
    shopName: offer.seller,
    sales: offer.sales,
    rating: offer.rating,
    promotion: offer.originalPrice === undefined ? undefined : { originalPrice: offer.originalPrice },
    productUrl: offer.url,
  };
}

/**
 * Development-only adapter that turns existing PriceAI fixture offers into
 * normalized external-platform-shaped results. It never pretends to call a marketplace.
 */
export class MockPlatformAdapter implements PlatformAdapter {
  readonly id = "mock" as const;

  constructor(private readonly products: Product[]) {}

  async searchProducts(query: string, options: PlatformSearchOptions = {}): Promise<PlatformSearchResult[]> {
    if (!query.trim()) return [];

    const normalized = searchProducts(this.products, query)
      .flatMap((product) => product.variants.flatMap((variant) => variant.offers.map((offer) => normalizeOffer(product, offer))))
      .filter((result) => options.minPrice === undefined || result.price >= options.minPrice)
      .filter((result) => options.maxPrice === undefined || result.price <= options.maxPrice);
    const sorted = sortResults(normalized, options.sort);
    const limit = toPositiveInteger(options.limit, 20);
    const page = toPositiveInteger(options.page, 1);
    const offset = (page - 1) * limit;

    return sorted.slice(offset, offset + limit);
  }
}
