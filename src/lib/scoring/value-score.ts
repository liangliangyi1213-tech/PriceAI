import { canUseOfferForScore } from "@/lib/catalog/provenance";
import { getLowestOffer } from "@/lib/pricing/offers";
import type { ProductVariant } from "@/types/catalog";

export type VariantScore = { total: number | null; reason: string };

export function scoreVariant(variant: ProductVariant): VariantScore {
  const offer = getLowestOffer(variant.offers.filter(canUseOfferForScore));
  if (!offer) return { total: null, reason: "暂无具备可信来源与完整事实的评分报价" };

  const price = Math.max(0, Math.min(100, 100 - (offer.price - 2000) / 80));
  const total = Math.round(
    price * 0.4
    + variant.performance * 0.25
    + offer.rating / 5 * 100 * 0.15
    + Math.min(100, Math.log10(offer.sales + 1) * 20) * 0.1
    + 90 * 0.1,
  );
  return {
    total,
    reason: total >= 80 ? "配置均衡，当前价格有竞争力。" : "综合表现可靠，建议结合预算选择。",
  };
}
