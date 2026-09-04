import { formatPrice, hasValidOfferPrice } from "@/lib/pricing/offers";
import type { ProductSearchQuery } from "@/lib/search/query";
import type { ProductSearchRow } from "@/lib/search/products";
import type { Offer } from "@/types/catalog";

/** URL presentation only; parsing, filtering and ranking remain in lib/search. */
export function searchHref(query: ProductSearchQuery, compare: string[] = [], changes: Partial<ProductSearchQuery> = {}): string {
  const next = { ...query, ...changes };
  const params = new URLSearchParams();
  if (next.query) params.set("q", next.query);
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

/** Compare like-for-like offers for the variant used by the existing search score. */
export function productCardDetails(row: ProductSearchRow) {
  const variant = row.lowestOffer
    ? row.product.variants.find((candidate) => candidate.offers.some((offer) => offer.id === row.lowestOffer?.id))
    : undefined;
  const platforms = new Map<string, Offer>();
  for (const offer of variant?.offers ?? []) {
    if (!hasValidOfferPrice(offer)) continue;
    const previous = platforms.get(offer.platform);
    if (!previous || offer.price < previous.price) platforms.set(offer.platform, offer);
  }
  return { variant, offers: [...platforms.values()].sort((a, b) => a.price - b.price) };
}

/** A deterministic quote observation, not an AI response or explanation of the overall score. */
export function purchaseOpinion(row: ProductSearchRow): string {
  const { offers } = productCardDetails(row);
  if (!offers.length) return "暂无有效报价，暂不作购买判断。";
  if (offers.length === 1) return "仅收录 1 个平台报价，建议再作比较。";
  const difference = Math.round((offers[1].price - offers[0].price) * 100) / 100;
  if (difference === 0) return "多个平台同为最低报价，建议核对服务与购买条件。";
  return `同规格最低价比第二低价低 ${formatPrice(difference)}，可以优先比较。`;
}
