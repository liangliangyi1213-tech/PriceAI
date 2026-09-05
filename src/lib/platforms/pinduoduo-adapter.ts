import "server-only";

import { PlatformAuthError, PlatformUnavailableError, toSafePlatformError } from "./errors";
import type { PinduoduoClient, PinduoduoRecommendedGoods } from "./pinduoduo-client";
import type { PlatformAdapter, PlatformSearchOptions, PlatformSearchResult } from "./types";

type RecommendationSource = {
  getRecommendedProducts(options?: PlatformSearchOptions): Promise<PlatformSearchResult[]>;
};

function parseSalesTip(value: string | null): number | undefined {
  if (!value) return undefined;
  const match = value.replaceAll(",", "").match(/(\d+(?:\.\d+)?)\s*(万)?/);
  if (!match) return undefined;
  const amount = Number(match[1]) * (match[2] ? 10_000 : 1);
  return Number.isFinite(amount) ? Math.floor(amount) : undefined;
}

export function mapPinduoduoGoods(goods: PinduoduoRecommendedGoods): PlatformSearchResult {
  return {
    platform: "pdd",
    externalProductId: goods.goodsId,
    externalVariantId: goods.goodsSign ?? undefined,
    title: goods.goodsName,
    price: goods.minNormalPrice,
    imageUrl: goods.goodsImageUrl ?? goods.goodsThumbnailUrl ?? undefined,
    shopName: goods.mallName,
    sales: parseSalesTip(goods.realtimeSalesTip ?? goods.salesTip),
    productUrl: "",
    sourceMetadata: {
      categoryName: goods.categoryName,
      merchantType: goods.merchantType,
      salesTip: goods.salesTip,
      realtimeSalesTip: goods.realtimeSalesTip,
      hasCoupon: goods.hasCoupon,
      couponPrice: goods.couponPrice,
      couponMinOrderAmount: goods.couponMinOrderAmount,
      minNormalPrice: goods.minNormalPrice,
      promotionRate: goods.promotionRate,
      thumbnailUrl: goods.goodsThumbnailUrl,
    },
  };
}

export class PinduoduoAdapter implements PlatformAdapter {
  readonly id = "pdd" as const;

  constructor(private readonly options: {
    client: Pick<PinduoduoClient, "getRecommendedGoods"> | null;
    fallback?: RecommendationSource;
    isDevelopment?: boolean;
  }) {}

  async searchProducts(query: string): Promise<PlatformSearchResult[]> {
    void query;
    throw new PlatformUnavailableError("pdd");
  }

  async getRecommendedProducts(options: PlatformSearchOptions = {}): Promise<PlatformSearchResult[]> {
    const limit = typeof options.limit === "number" && Number.isFinite(options.limit) ? Math.max(1, Math.floor(options.limit)) : 20;
    const page = typeof options.page === "number" && Number.isFinite(options.page) ? Math.max(1, Math.floor(options.page)) : 1;
    const getFallbackResults = () => this.options.fallback?.getRecommendedProducts(options);
    if (!this.options.client) {
      if (this.options.isDevelopment && this.options.fallback) return getFallbackResults()!;
      throw new PlatformAuthError("pdd");
    }
    try {
      const response = await this.options.client.getRecommendedGoods({ limit, offset: (page - 1) * limit });
      return response.goods.map(mapPinduoduoGoods);
    } catch (error) {
      if (this.options.isDevelopment && this.options.fallback) return getFallbackResults()!;
      throw toSafePlatformError("pdd", error);
    }
  }
}
