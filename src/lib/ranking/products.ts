import { canUseOfferFact } from "@/lib/catalog/provenance";
import { getLowestOffer } from "@/lib/pricing/offers";
import type { Offer, Product } from "@/types/catalog";

export type SortMode = "recommended" | "price" | "rating" | "sales";

function compareNullable(left: number | null, right: number | null, direction: "asc" | "desc"): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction === "asc" ? left - right : right - left;
}

function metric(product: Product, fact: "price" | "rating" | "sales", usage: "sort"): number | null {
  const offers = product.variants[0]?.offers ?? [];
  const offer = getLowestOffer(offers.filter((candidate) => canUseOfferFact(candidate, fact, usage)));
  return offer?.[fact] ?? null;
}

export function getRankingPriceOffer(product: Product): Offer | undefined {
  const offers = product.variants[0]?.offers ?? [];
  return getLowestOffer(offers.filter((offer) => canUseOfferFact(offer, "price", "sort")));
}

export function sortProducts(rows: Array<{ product: Product; score: number | null }>, mode: SortMode) {
  return [...rows].sort((left, right) => {
    if (mode === "price") return compareNullable(metric(left.product, "price", "sort"), metric(right.product, "price", "sort"), "asc");
    if (mode === "rating") return compareNullable(metric(left.product, "rating", "sort"), metric(right.product, "rating", "sort"), "desc");
    if (mode === "sales") return compareNullable(metric(left.product, "sales", "sort"), metric(right.product, "sales", "sort"), "desc");
    return compareNullable(left.score, right.score, "desc");
  });
}
