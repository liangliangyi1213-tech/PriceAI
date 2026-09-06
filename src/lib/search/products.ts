import { getLowestOffer } from "@/lib/pricing/offers";
import { scoreVariant } from "@/lib/scoring/value-score";
import type { Offer, Product, ProductVariant } from "@/types/catalog";

import type { ProductSearchQuery, ProductSearchSort } from "./query";
import type { LivePinduoduoOffer } from "./pinduoduo-live-offer";

export type ProductSearchRow = {
  product: Product;
  lowestOffer?: Offer;
  valueScore: number | null;
  rating: number | null;
  sales: number | null;
  platformCount: number;
  livePinduoduoOffers: readonly LivePinduoduoOffer[];
  displayLowestPrice: number | null;
  relevance: number;
  catalogIndex: number;
};

function compact(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, "");
}

function searchableVariantText(variant: ProductVariant): string {
  return [variant.storage, variant.color, variant.region, variant.condition].join(" ");
}

function getRelevance(product: Product, query: string | undefined): number {
  if (!query) return 0;

  const needle = compact(query);
  if (!needle) return 0;
  const name = compact(product.name);
  const brand = compact(product.brand);
  const variantText = compact(product.variants.map(searchableVariantText).join(" "));
  const specs = compact(Object.values(product.specs).join(" "));
  const description = compact(product.description);
  const category = product.category === "phone" ? "手机phone" : product.category;

  if (name === needle) return 1_000;
  if (name.startsWith(needle)) return 900;
  if (name.includes(needle)) return 800;
  if (brand === needle) return 700;
  if (brand.includes(needle)) return 650;
  if (variantText.includes(needle)) return 500;
  if (specs.includes(needle)) return 400;
  if (description.includes(needle) || compact(category).includes(needle)) return 200;
  return -1;
}

function getProductMetrics(
  product: Product,
  catalogIndex: number,
  relevance: number,
  livePinduoduoOffers: readonly LivePinduoduoOffer[],
): ProductSearchRow {
  const variantOffers = product.variants
    .map((variant) => ({ variant, offer: getLowestOffer(variant.offers) }))
    .filter((entry): entry is { variant: ProductVariant; offer: Offer } => entry.offer !== undefined);
  const lowestEntry = variantOffers.reduce<{ variant: ProductVariant; offer: Offer } | undefined>(
    (lowest, entry) => !lowest || entry.offer.price < lowest.offer.price ? entry : lowest,
    undefined,
  );
  const lowestOffer = lowestEntry?.offer;
  const valueScore = lowestEntry ? scoreVariant(lowestEntry.variant).total : null;
  const rating = lowestOffer && Number.isFinite(lowestOffer.rating) ? lowestOffer.rating : null;
  const sales = lowestOffer && Number.isFinite(lowestOffer.sales) ? lowestOffer.sales : null;
  const platformCount = new Set(variantOffers.map((entry) => entry.offer.platform)).size;
  const comparableLiveOffers = lowestEntry
    ? livePinduoduoOffers.filter((offer) => offer.variantId === lowestEntry.variant.id)
    : [];
  const liveLowestPrice = comparableLiveOffers.reduce<number | null>((lowest, offer) => {
    if (!Number.isFinite(offer.price) || offer.price <= 0) return lowest;
    return lowest === null || offer.price < lowest ? offer.price : lowest;
  }, null);
  const persistedLowestPrice = lowestOffer?.price ?? null;
  const displayLowestPrice = liveLowestPrice === null
    ? persistedLowestPrice
    : persistedLowestPrice === null ? liveLowestPrice : Math.min(persistedLowestPrice, liveLowestPrice);

  return {
    product,
    lowestOffer,
    valueScore,
    rating,
    sales,
    platformCount,
    livePinduoduoOffers,
    displayLowestPrice,
    relevance,
    catalogIndex,
  };
}

function matchesBrands(product: Product, brands: string[] | undefined): boolean {
  if (!brands?.length) return true;
  const productBrand = compact(product.brand);
  return brands.some((brand) => compact(brand) === productBrand);
}

function hasMetricInRange(value: number | null | undefined, min: number | undefined, max: number | undefined): boolean {
  if (min === undefined && max === undefined) return true;
  if (value === null || value === undefined) return false;
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

function compareMetricDescending(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function compareMetricAscending(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function compareBySort(left: ProductSearchRow, right: ProductSearchRow, sort: ProductSearchSort): number {
  if (sort === "price_asc") {
    return compareMetricAscending(left.displayLowestPrice, right.displayLowestPrice);
  }
  if (sort === "price_desc") return compareMetricDescending(left.displayLowestPrice, right.displayLowestPrice);
  if (sort === "score_desc") return compareMetricDescending(left.valueScore, right.valueScore);
  if (sort === "rating_desc") return compareMetricDescending(left.rating, right.rating);
  if (sort === "sales_desc") return compareMetricDescending(left.sales, right.sales);
  return right.relevance - left.relevance;
}

/** Applies PriceAI product-domain search, filtering and stable ordering in memory. */
export function searchCatalog(
  products: Product[],
  searchQuery: ProductSearchQuery,
  liveOffersByProduct?: ReadonlyMap<string, readonly LivePinduoduoOffer[]>,
): ProductSearchRow[] {
  return products
    .map((product, catalogIndex) => ({ product, catalogIndex, relevance: getRelevance(product, searchQuery.query) }))
    .filter(({ relevance }) => !searchQuery.query || relevance >= 0)
    .filter(({ product }) => matchesBrands(product, searchQuery.brands))
    .map(({ product, catalogIndex, relevance }) => getProductMetrics(product, catalogIndex, relevance, liveOffersByProduct?.get(product.id) ?? []))
    .filter((row) => hasMetricInRange(row.displayLowestPrice, searchQuery.minPrice, searchQuery.maxPrice))
    .filter((row) => searchQuery.minScore === undefined || (row.valueScore !== null && row.valueScore >= searchQuery.minScore))
    .sort((left, right) => compareBySort(left, right, searchQuery.sort) || left.catalogIndex - right.catalogIndex);
}

/** Backward-compatible keyword-only helper retained for existing callers. */
export function searchProducts(products: Product[], query: string): Product[] {
  return searchCatalog(products, { query, sort: "relevance" }).map((row) => row.product);
}
