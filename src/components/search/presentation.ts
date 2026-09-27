import { formatPrice, hasValidOfferPrice } from "@/lib/pricing/offers";
import type { LivePinduoduoOffer } from "@/lib/search/pinduoduo-live-offer";
import type { ProductSearchQuery } from "@/lib/search/query";
import type { ProductSearchRow } from "@/lib/search/products";
import type { Offer } from "@/types/catalog";
import { canUseOfferForCompare } from "@/lib/catalog/provenance";
export {
  catalogOfferSourceDisclosure,
  catalogOfferSourceLabel,
  catalogScoreSourceDisclosure,
} from "@/lib/pricing/offer-provenance";

/** URL presentation only; parsing, filtering and ranking remain in lib/search. */
export function searchHref(query: ProductSearchQuery, compare: string[] = [], changes: Partial<ProductSearchQuery> = {}): string {
  const next = { ...query, ...changes };
  const params = new URLSearchParams();
  if (next.query) params.set("q", next.query);
  if (next.category) params.set("category", next.category);
  next.brands?.forEach((brand) => params.append("brand", brand));
  if (next.minPrice !== undefined) params.set("minPrice", String(next.minPrice));
  if (next.maxPrice !== undefined) params.set("maxPrice", String(next.maxPrice));
  if (next.minScore !== undefined) params.set("minScore", String(next.minScore));
  params.set("sort", next.sort);
  compare.forEach((slug) => params.append("compare", slug));
  return `/search?${params.toString()}`;
}

export function categoryLabel(category: string): string {
  const labels: Record<string, string> = { phone: "手机" };
  return labels[category] ?? category;
}

function suppliedText(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isCouponAmount(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

/** Whitelists the optional facts that may be rendered for a public live listing. */
export function livePinduoduoOfferFacts(offer: LivePinduoduoOffer) {
  const image = offer.image;
  const salesLabel = suppliedText(offer.realtimeSalesTip) ?? suppliedText(offer.salesTip)
    ?? (offer.sales !== null && Number.isFinite(offer.sales) && offer.sales >= 0 ? `销量 ${offer.sales.toLocaleString("zh-CN")}` : null);
  const couponLabels: string[] = [];
  if (offer.hasCoupon) couponLabels.push("有券");
  if (isCouponAmount(offer.couponAmount)) couponLabels.push(`券额 ${formatPrice(offer.couponAmount)}`);
  if (isCouponAmount(offer.couponMinOrderAmount)) couponLabels.push(`使用门槛 ${formatPrice(offer.couponMinOrderAmount)}`);
  if (isCouponAmount(offer.extraCouponAmount)) couponLabels.push(`额外优惠 ${formatPrice(offer.extraCouponAmount)}`);
  return { image, salesLabel, couponLabels };
}

/** Compare like-for-like offers for the variant used by the existing search score. */
export function productCardDetails(row: ProductSearchRow) {
  const variant = row.selectedVariantId
    ? row.product.variants.find((candidate) => candidate.id === row.selectedVariantId)
    : undefined;
  const platforms = new Map<string, Offer>();
  for (const offer of variant?.offers ?? []) {
    if (!hasValidOfferPrice(offer)) continue;
    const previous = platforms.get(offer.platform);
    if (!previous || offer.price < previous.price) platforms.set(offer.platform, offer);
  }
  return { variant, offers: [...platforms.values()].sort((a, b) => a.price - b.price) };
}

/** Describes provenance without treating a stored or synchronized row as a real-time platform quote. */
/** A deterministic quote observation, not an AI response or explanation of the overall score. */
export function purchaseOpinion(row: ProductSearchRow): string {
  const { offers } = productCardDetails(row);
  const comparableOffers = offers.filter(canUseOfferForCompare);
  const hasLivePinduoduoOffers = row.livePinduoduoOffers.length > 0;
  if (!comparableOffers.length) return hasLivePinduoduoOffers
    ? "当前没有足够的 Catalog 已收录可比报价；实时拼多多报价不参与此购买参考。"
    : "当前没有足够的 Catalog 已收录可比报价，暂不作购买判断。";
  if (comparableOffers.length === 1) return hasLivePinduoduoOffers
    ? "当前仅有 1 个 Catalog 已收录可比报价；实时拼多多报价不参与此购买参考，无法计算与第二低价的差额。"
    : "当前仅有 1 个 Catalog 已收录可比报价，无法计算与第二低价的差额。";
  const difference = Math.round((comparableOffers[1].price - comparableOffers[0].price) * 100) / 100;
  if (difference === 0) return hasLivePinduoduoOffers
    ? "Catalog 已收录报价中，多个平台标识同为最低报价；此参考不含实时拼多多报价。"
    : "Catalog 中多个平台标识同为最低报价，建议核对服务与购买条件。";
  if (hasLivePinduoduoOffers) {
    return `Catalog 已收录报价中，同规格最低报价比第二低报价低 ${formatPrice(difference)}；此参考不含实时拼多多报价。`;
  }
  return `Catalog 同规格最低报价比第二低报价低 ${formatPrice(difference)}，可以优先比较。`;
}
