import { formatPrice, hasValidOfferPrice } from "@/lib/pricing/offers";
import { canUseOfferForCompare } from "@/lib/catalog/provenance";
import type { Offer, ProductVariant } from "@/types/catalog";

export function getDetailOffers(offers: readonly Offer[]): Offer[] {
  return offers.filter(hasValidOfferPrice).sort((a, b) => a.price - b.price);
}

export function getDetailPurchaseReference(variant: ProductVariant): string {
  const platforms = new Map<string, Offer>();
  for (const offer of getDetailOffers(variant.offers)) {
    if (!canUseOfferForCompare(offer)) continue;
    if (!platforms.has(offer.platform)) platforms.set(offer.platform, offer);
  }
  const offers = [...platforms.values()];
  if (!offers.length) return "当前没有足够的已收录可比报价，暂不作购买判断。";
  if (offers.length === 1) return "当前仅有 1 个已收录可比报价，无法计算与第二低价的差额。";
  const difference = Math.round((offers[1].price - offers[0].price) * 100) / 100;
  if (difference === 0) return "多个平台同为最低报价，建议核对服务与购买条件。";
  return `同规格最低报价比第二低报价低 ${formatPrice(difference)}，可以优先比较。`;
}
