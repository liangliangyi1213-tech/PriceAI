import type { Offer } from "@/types/catalog";

function normalizedSource(offer: Offer): string {
  return offer.source?.trim().toLowerCase() ?? "";
}

export function isDemonstrationCatalogOffer(offer: Offer): boolean {
  const source = normalizedSource(offer);
  return source === "mock" || source === "seed" || (!source && offer.url.trim() === "#");
}

export function hasDemonstrationCatalogOffers(offers: readonly Offer[]): boolean {
  return offers.some(isDemonstrationCatalogOffer);
}

export function catalogOfferSourceLabel(offer: Offer): string {
  const source = normalizedSource(offer);
  if (source === "platform_sync") return "平台同步记录，非实时平台价格";
  if (source === "verified_platform") return "已核验平台记录，非实时平台价格";
  if (isDemonstrationCatalogOffer(offer)) {
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
  const sources = new Set(offers.map(catalogOfferSourceLabel));
  if (sources.size === 1 && sources.has("平台同步记录，非实时平台价格")) {
    return "评分基于平台同步记录与已收录规格信息，不代表当前价格已实时核验。";
  }
  if (!offers.length) return "暂无有效 Catalog 报价，当前评分仅作信息占位。";
  return "评分基于 Catalog 已收录报价与规格信息，仅供参考，不代表实时购买结论。";
}

export function catalogLowestOfferLabel(offer: Offer): string {
  return isDemonstrationCatalogOffer(offer) ? "演示数据中最低报价" : "已收录数据中最低报价";
}
