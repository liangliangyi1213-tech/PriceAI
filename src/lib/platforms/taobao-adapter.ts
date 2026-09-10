import "server-only";

import { PlatformAuthError, toSafePlatformError } from "./errors";
import { matchTaobaoPhoneOffer, type TaobaoProductMatch } from "./taobao-matching";
import type { LiveTaobaoOffer, TaobaoClient, TaobaoMaterialSearchResponse } from "./taobao-client";
import type { PlatformAdapter, PlatformSearchOptions, PlatformSearchResult, PlatformSearchSort } from "./types";
import type { Product } from "@/types/catalog";

function boundedInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}

function sortResults(results: PlatformSearchResult[], sort: PlatformSearchSort | undefined): PlatformSearchResult[] {
  if (sort === "price_asc") return [...results].sort((left, right) => left.price - right.price);
  if (sort === "price_desc") return [...results].sort((left, right) => right.price - left.price);
  return results;
}

/** Maps Taobao's public Alliance fields to the platform boundary, never to a ProductVariant or Offer. */
export function mapTaobaoLiveOffer(offer: LiveTaobaoOffer): PlatformSearchResult {
  return {
    platform: "taobao",
    externalProductId: offer.itemId,
    title: offer.title,
    // zk_final_price is comparable. final_promotion_price remains conditional metadata only.
    price: offer.salePrice,
    originalPrice: offer.reservePrice ?? undefined,
    imageUrl: offer.pictUrl ?? offer.smallImages[0],
    shopName: offer.shopTitle,
    sales: offer.totalSales ?? offer.annualVol ?? undefined,
    productUrl: offer.clickUrl ?? "",
    sourceMetadata: {
      shortTitle: offer.shortTitle,
      brandName: offer.brandName,
      categoryId: offer.categoryId,
      categoryName: offer.categoryName,
      sellerId: offer.sellerId,
      reservePrice: offer.reservePrice,
      salePrice: offer.salePrice,
      promotionPrice: offer.promotionPrice,
      promotionTags: offer.promotionTagList.join(" | ") || null,
      govSubsidyTag: offer.govSubsidy?.tagName ?? null,
      annualVol: offer.annualVol,
    },
  };
}

export type TaobaoPhoneOfferResult = { offer: LiveTaobaoOffer; match: TaobaoProductMatch };

/** Creates a phone search keyword solely from PriceAI's canonical Product. */
export function createTaobaoPhoneSearchKeyword(product: Product): string {
  return `${product.name.replace(/\s+/g, "")} 手机`;
}

export class TaobaoAdapter implements PlatformAdapter {
  readonly id = "taobao" as const;
  readonly catalogSyncCapability = "product_only" as const;

  constructor(private readonly options: { client: Pick<TaobaoClient, "searchPhoneGoods"> | null }) {}

  private async searchLivePhoneOffers(query: string, options: PlatformSearchOptions = {}): Promise<TaobaoMaterialSearchResponse> {
    if (!query.trim()) return { items: [], rawCount: 0 };
    if (!this.options.client) throw new PlatformAuthError("taobao");
    try {
      return await this.options.client.searchPhoneGoods(query, {
        limit: boundedInteger(options.limit, 20),
        page: boundedInteger(options.page, 1),
        startPrice: options.minPrice,
      });
    } catch (error) {
      throw toSafePlatformError("taobao", error);
    }
  }

  async searchProducts(query: string, options: PlatformSearchOptions = {}): Promise<PlatformSearchResult[]> {
    const response = await this.searchLivePhoneOffers(query, options);
    const mapped = response.items
      .map(mapTaobaoLiveOffer)
      .filter((item) => options.minPrice === undefined || item.price >= options.minPrice)
      .filter((item) => options.maxPrice === undefined || item.price <= options.maxPrice);
    return sortResults(mapped, options.sort);
  }

  /** Searches using the PriceAI Product name and returns only strict product-level match outcomes. */
  async searchPhoneOffersForProduct(product: Product, options: PlatformSearchOptions = {}): Promise<TaobaoPhoneOfferResult[]> {
    const response = await this.searchLivePhoneOffers(createTaobaoPhoneSearchKeyword(product), options);
    return response.items.map((offer) => ({ offer, match: matchTaobaoPhoneOffer(offer, product) }));
  }
}
