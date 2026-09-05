import { formatPrice, hasValidOfferPrice } from "@/lib/pricing/offers";
import type { Offer, ProductVariant } from "@/types/catalog";

export function getDetailOffers(offers: readonly Offer[]): Offer[] {
  return offers.filter(hasValidOfferPrice).sort((a, b) => a.price - b.price);
}

export function getDetailPurchaseReference(variant: ProductVariant): string {
  const platforms = new Map<string, Offer>();
  for (const offer of getDetailOffers(variant.offers)) {
    if (!platforms.has(offer.platform)) platforms.set(offer.platform, offer);
  }
  const offers = [...platforms.values()];
  if (!offers.length) return "暂无有效报价，暂不作购买判断。";
  if (offers.length === 1) return "仅收录 1 个平台报价，建议再作比较。";
  const difference = Math.round((offers[1].price - offers[0].price) * 100) / 100;
  if (difference === 0) return "多个平台同为最低报价，建议核对服务与购买条件。";
  return `同规格最低报价比第二低报价低 ${formatPrice(difference)}，可以优先比较。`;
}
