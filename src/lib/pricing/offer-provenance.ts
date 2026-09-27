import type { Offer } from "@/types/catalog";
import { canUseOfferForScore, classifyOfferProvenance } from "@/lib/catalog/provenance";

export function isDemonstrationCatalogOffer(offer: Offer): boolean {
  return classifyOfferProvenance(offer).demonstration;
}

export function hasDemonstrationCatalogOffers(offers: readonly Offer[]): boolean {
  return offers.some(isDemonstrationCatalogOffer);
}

export function catalogOfferSourceLabel(offer: Offer): string {
  const provenance = classifyOfferProvenance(offer);
  if (provenance.kind === "platform_sync") return "平台同步记录，非实时平台价格";
  if (provenance.kind === "verified_platform") return "已核验平台记录，非实时平台价格";
  if (provenance.kind === "live_platform") return "平台实时价格";
  if (provenance.kind === "unknown") return "来源未确认的 Catalog 记录，非实时平台价格";
  if (provenance.demonstration) {
    return "演示数据，非实时平台价格";
  }
  return "Catalog 已收录记录，非实时平台价格";
}

export function catalogOfferSourceDisclosure(offers: readonly Offer[]): string {
  const labels = new Set(offers.map(catalogOfferSourceLabel));
  if (labels.size === 1) return [...labels][0];
  return "包含不同来源的 Catalog 记录，非实时平台价格";
}

export function catalogScoreSourceDisclosure(offers: readonly Offer[]): string {
  if (hasDemonstrationCatalogOffers(offers)) {
    return "评分包含演示 Catalog 报价，仅供参考，不代表实时购买结论。";
  }
  if (!offers.length) return "暂无有效 Catalog 报价，当前评分仅作信息占位。";
  if (!offers.some(canUseOfferForScore)) return "报价来源或事实完整度不足，暂不形成 PriceAI 评分。";
  return "评分基于 Catalog 已收录报价与规格信息，仅供参考，不代表实时购买结论。";
}

export function catalogLowestOfferLabel(offer: Offer): string {
  return isDemonstrationCatalogOffer(offer) ? "演示数据中最低报价" : "已收录数据中最低报价";
}
