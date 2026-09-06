import type { PinduoduoGoods } from "@/lib/platforms/pinduoduo-client";
import type { Product } from "@/types/catalog";
import { pinduoduoTokens, scorePinduoduoRelevance } from "./pinduoduo-relevance";

type ComparablePrice = { price: number; normalPrice?: number; groupPrice?: number; couponPrice?: number };

/** A public live listing, intentionally independent of the persisted/rated catalog Offer. */
export type LivePinduoduoOffer = ComparablePrice & {
  productId: string;
  variantId: string | null;
  goodsId: string;
  title: string;
  image: string | null;
  merchant: string;
  merchantType: number | null;
  hasCoupon: boolean;
  /** Unconfirmed raw coupon metadata; never a selected payable price. */
  couponAmount?: number;
  couponMinOrderAmount?: number;
  extraCouponAmount?: number;
  salesTip: string | null;
  realtimeSalesTip: string | null;
  sales: number | null;
  promotionRate?: number;
  source: "live";
  fetchedAt: string;
  relevance: number;
};

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function nonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function selectComparablePinduoduoPrice(goods: PinduoduoGoods): ComparablePrice | null {
  const normalPrice = positive(goods.minNormalPrice) ? goods.minNormalPrice : undefined;
  const groupPrice = positive(goods.minGroupPrice) ? goods.minGroupPrice : undefined;
  if (normalPrice === undefined && groupPrice === undefined) return null;
  // PinduoduoGoods cannot confirm couponPrice is a final payable price. Even a
  // satisfied minimum-order threshold cannot establish that missing provenance.
  return {
    price: Math.min(normalPrice ?? Infinity, groupPrice ?? Infinity),
    ...(normalPrice !== undefined ? { normalPrice } : {}),
    ...(groupPrice !== undefined ? { groupPrice } : {}),
  };
}

function salesFromTip(tip: string | null): number | null {
  if (!tip) return null;
  const match = tip.replace(/,/g, "").match(/^(?:已售|销量|已拼)?\s*(\d+(?:\.\d+)?)\s*(万|千|亿)?\+?\s*(?:件|人|单)?$/);
  if (!match) return null;
  const value = Number(match[1]) * ({ 万: 10_000, 千: 1_000, 亿: 100_000_000 }[match[2]] ?? 1);
  return nonNegative(value) ? value : null;
}

function matchingVariantId(product: Product, title: string): string | null {
  const normalized = pinduoduoTokens(title).join(" ");
  const storages = normalized.match(/\d+ (?:gb|tb)\b/g) ?? [];
  const conditions = (title.match(/二手|官翻|翻新|全新/g) ?? []).map((condition) => condition === "翻新" ? "官翻" : condition);
  // Extract explicit attributes independently of the catalog. Unknown values
  // must not disappear just because this catalog has no corresponding variant.
  const colors = [...new Set([
    ...(title.match(/[\u3400-\u9fff]{1,12}色/g) ?? []),
    ...product.variants.map((variant) => variant.color).filter((color) => title.includes(color)),
  ])];
  const regionAlias = (region: string) => /^(?:国行|国行版|大陆版)$/.test(region) ? "国行" : region === "港行" ? "港版" : region;
  const regions = (title.match(/国行版?|港行|[\u3400-\u9fff]{1,6}版/g) ?? []).map(regionAlias);
  if (/颜色随机|随机颜色|随机色|多色可选|版本随机|地区随机/.test(title)) return null;
  const matches = product.variants.filter((variant) =>
    (!storages.length || storages.every((storage) => storage === pinduoduoTokens(variant.storage).join(" ")))
    && conditions.every((condition) => variant.condition === condition)
    && colors.every((color) => color === variant.color)
    && regions.every((region) => region === regionAlias(variant.region)));
  // Product-level listings without variant evidence must not invent a SKU association.
  return matches.length === 1 && (storages.length > 0 || colors.length > 0) ? matches[0].id : null;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareOffers(left: LivePinduoduoOffer, right: LivePinduoduoOffer): number {
  return right.relevance - left.relevance || left.price - right.price
    || (right.sales ?? -1) - (left.sales ?? -1) || compareText(left.goodsId, right.goodsId)
    // Fully tied duplicate IDs choose a stable representative, regardless of input order.
    || compareText(JSON.stringify(left), JSON.stringify(right));
}

export function selectLivePinduoduoOffers(products: readonly Product[], query: string, goods: readonly PinduoduoGoods[], limitPerProduct = 5): Map<string, LivePinduoduoOffer[]> {
  const results = new Map<string, LivePinduoduoOffer[]>();
  const limit = Number.isFinite(limitPerProduct) ? Math.max(0, Math.floor(limitPerProduct)) : 5;
  if (!query.trim() || limit === 0) return results;
  for (const product of products) {
    const offers: LivePinduoduoOffer[] = [];
    for (const item of goods) {
      const relevance = scorePinduoduoRelevance(query, product, item);
      const prices = selectComparablePinduoduoPrice(item);
      if (relevance < 100 || !prices || !item.goodsId.trim() || !Number.isFinite(item.fetchedAt.getTime())) continue;
      offers.push({
        productId: product.id, variantId: matchingVariantId(product, item.goodsName),
        goodsId: item.goodsId, title: item.goodsName,
        image: item.goodsImageUrl ?? item.goodsThumbnailUrl, merchant: item.mallName,
        merchantType: item.merchantType, ...prices, hasCoupon: item.hasCoupon,
        ...(nonNegative(item.couponPrice) ? { couponAmount: item.couponPrice } : {}),
        ...(nonNegative(item.couponMinOrderAmount) ? { couponMinOrderAmount: item.couponMinOrderAmount } : {}),
        ...(nonNegative(item.extraCouponAmount) ? { extraCouponAmount: item.extraCouponAmount } : {}),
        salesTip: item.salesTip, realtimeSalesTip: item.realtimeSalesTip,
        sales: salesFromTip(item.salesTip),
        ...(nonNegative(item.promotionRate) ? { promotionRate: item.promotionRate } : {}),
        source: "live", fetchedAt: item.fetchedAt.toISOString(), relevance,
      });
    }
    offers.sort(compareOffers);
    const seen = new Set<string>();
    const selected = offers.filter((offer) => {
      if (seen.has(offer.goodsId)) return false;
      seen.add(offer.goodsId);
      return true;
    }).slice(0, limit);
    if (selected.length) results.set(product.id, selected);
  }
  return results;
}
