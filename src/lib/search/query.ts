export const productSearchSorts = [
  "relevance",
  "price_asc",
  "price_desc",
  "score_desc",
  "rating_desc",
  "sales_desc",
] as const;

export type ProductSearchSort = (typeof productSearchSorts)[number];

export type ProductSearchQuery = {
  query?: string;
  brands?: string[];
  minPrice?: number;
  maxPrice?: number;
  minScore?: number;
  sort: ProductSearchSort;
};

export type SearchParamValue = string | string[] | undefined;
export type SearchParamRecord = Record<string, SearchParamValue>;

function firstValue(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizedWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function parseNonNegativeNumber(value: SearchParamValue): number | undefined {
  const raw = firstValue(value);
  if (raw === undefined || !raw.trim()) return undefined;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseBrands(value: SearchParamValue): string[] | undefined {
  const values = (Array.isArray(value) ? value : [value])
    .flatMap((item) => item?.split(",") ?? [])
    .map(normalizedWhitespace)
    .filter(Boolean);
  const unique = values.filter((brand, index) => values.findIndex((candidate) => candidate.toLowerCase() === brand.toLowerCase()) === index);

  return unique.length ? unique : undefined;
}

function parseSort(value: SearchParamValue): ProductSearchSort {
  const sort = firstValue(value);
  return productSearchSorts.includes(sort as ProductSearchSort) ? (sort as ProductSearchSort) : "relevance";
}

export function parseProductSearchQuery(params: SearchParamRecord): ProductSearchQuery {
  const query = firstValue(params.q);
  const minPrice = parseNonNegativeNumber(params.minPrice);
  const maxPrice = parseNonNegativeNumber(params.maxPrice);
  const parsedScore = parseNonNegativeNumber(params.minScore);
  const result: ProductSearchQuery = { sort: parseSort(params.sort) };
  const normalizedQuery = query === undefined ? undefined : normalizedWhitespace(query);

  if (normalizedQuery) result.query = normalizedQuery;
  const brands = parseBrands(params.brand);
  if (brands) result.brands = brands;
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) return result;
  if (minPrice !== undefined) result.minPrice = minPrice;
  if (maxPrice !== undefined) result.maxPrice = maxPrice;
  if (parsedScore !== undefined && parsedScore <= 100) result.minScore = parsedScore;

  return result;
}
