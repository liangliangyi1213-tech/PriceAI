import { hasValidOfferPrice, getLowestOffer } from "@/lib/pricing/offers";
import { scoreVariant } from "@/lib/scoring/value-score";
import type { Offer, Product, ProductVariant } from "@/types/catalog";

import { parseCompareQuery } from "./query";
import type { CompareMetric, CompareMetricDirection, CompareProductViewModel } from "./types";

function getLowestOfferEntry(product: Product): { variant: ProductVariant; offer: Offer } | undefined {
  return product.variants
    .map((variant) => ({ variant, offer: getLowestOffer(variant.offers) }))
    .filter((entry): entry is { variant: ProductVariant; offer: Offer } => entry.offer !== undefined)
    .reduce<{ variant: ProductVariant; offer: Offer } | undefined>(
      (lowest, entry) => !lowest || entry.offer.price < lowest.offer.price ? entry : lowest,
      undefined,
    );
}

function findSpecification(product: Product, matcher: RegExp): string | null {
  return Object.entries(product.specs).find(([label]) => matcher.test(label))?.[1] ?? null;
}

function finiteMetric(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function toCompareView(product: Product): CompareProductViewModel {
  const lowestEntry = getLowestOfferEntry(product);
  const lowestOffer = lowestEntry?.offer;
  const validOfferCount = product.variants.flatMap((variant) => variant.offers).filter(hasValidOfferPrice).length;

  return {
    id: product.id,
    slug: product.slug,
    brand: product.brand,
    name: product.name,
    valueScore: lowestEntry ? scoreVariant(lowestEntry.variant).total : null,
    lowestPrice: lowestOffer?.price ?? null,
    lowestPricePlatform: lowestOffer?.platform ?? null,
    chip: findSpecification(product, /芯片|CPU/i),
    storage: product.variants[0]?.storage ?? null,
    screen: findSpecification(product, /屏幕/i),
    battery: findSpecification(product, /电池/i),
    camera: findSpecification(product, /摄|影像/i),
    rating: lowestOffer ? finiteMetric(lowestOffer.rating) : null,
    sales: lowestOffer ? finiteMetric(lowestOffer.sales) : null,
    offerCount: validOfferCount,
  };
}

/** Resolves valid catalog products in URL order and projects deterministic comparison data. */
export function buildCompareProducts(products: Product[], requestedSlugs: string[]): CompareProductViewModel[] {
  const catalogBySlug = new Map(products.map((product) => [product.slug, product]));

  return parseCompareQuery(requestedSlugs)
    .map((slug) => catalogBySlug.get(slug))
    .filter((product): product is Product => product !== undefined)
    .map(toCompareView);
}

/** Returns the best present value only; nulls never compete as zero. */
export function getBestCompareValue(
  products: CompareProductViewModel[],
  metric: CompareMetric,
  direction: CompareMetricDirection,
): number | null {
  const values = products.map((product) => product[metric]).filter((value): value is number => value !== null);
  if (!values.length) return null;

  return direction === "highest" ? Math.max(...values) : Math.min(...values);
}
