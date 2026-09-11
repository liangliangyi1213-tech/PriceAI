import type { Product } from "@/types/catalog";

export const searchCategoryIds = ["all", "phones", "clothing", "computers", "headphones", "appliances"] as const;

export type SearchCategoryId = (typeof searchCategoryIds)[number];
export type SearchMatcherId = "phone" | null;
export type SearchContextSource = "explicit" | "catalog" | "keyword" | "fallback";

export type SearchFacetCapabilities = {
  brands: boolean;
  price: boolean;
  score: boolean;
  rating: boolean;
  sales: boolean;
};

export type SearchCategoryConfig = {
  id: SearchCategoryId;
  label: string;
  catalogCategories: readonly string[];
  keywords: readonly string[];
  matcher: SearchMatcherId;
  taobaoCategoryId?: string;
  facets: SearchFacetCapabilities;
};

export type SearchContext = SearchCategoryConfig & { source: SearchContextSource };

const NO_FACETS: SearchFacetCapabilities = {
  brands: false,
  price: false,
  score: false,
  rating: false,
  sales: false,
};

const PHONE_FACETS: SearchFacetCapabilities = {
  brands: true,
  price: true,
  score: true,
  rating: true,
  sales: true,
};

export const searchCategoryRegistry: Readonly<Record<SearchCategoryId, SearchCategoryConfig>> = {
  all: {
    id: "all",
    label: "全部商品",
    catalogCategories: [],
    keywords: [],
    matcher: null,
    facets: NO_FACETS,
  },
  phones: {
    id: "phones",
    label: "手机",
    catalogCategories: ["phone"],
    keywords: ["手机", "智能手机", "iphone", "smartphone"],
    matcher: "phone",
    taobaoCategoryId: "1512",
    facets: PHONE_FACETS,
  },
  clothing: {
    id: "clothing",
    label: "服饰",
    catalogCategories: ["clothing", "shoes"],
    keywords: ["衣服", "服饰", "服装", "外套", "衬衫", "裤子", "裙子", "鞋子", "鞋"],
    matcher: null,
    facets: NO_FACETS,
  },
  computers: {
    id: "computers",
    label: "电脑",
    catalogCategories: ["computer", "laptop"],
    keywords: ["电脑", "笔记本", "台式机", "laptop", "macbook"],
    matcher: null,
    facets: NO_FACETS,
  },
  headphones: {
    id: "headphones",
    label: "耳机",
    catalogCategories: ["headphones"],
    keywords: ["耳机", "耳麦", "headphone", "earbuds", "airpods"],
    matcher: null,
    facets: NO_FACETS,
  },
  appliances: {
    id: "appliances",
    label: "家电",
    catalogCategories: ["appliance"],
    keywords: ["家电", "冰箱", "洗衣机", "空调", "电视", "微波炉"],
    matcher: null,
    facets: NO_FACETS,
  },
};

export function getSearchCategory(value: unknown): SearchCategoryConfig {
  if (typeof value !== "string") return searchCategoryRegistry.all;
  const normalized = value.trim().toLowerCase();
  return searchCategoryIds.includes(normalized as SearchCategoryId)
    ? searchCategoryRegistry[normalized as SearchCategoryId]
    : searchCategoryRegistry.all;
}

function context(config: SearchCategoryConfig, source: SearchContextSource): SearchContext {
  return { ...config, facets: { ...config.facets }, source };
}

function categoryFromCatalog(products: readonly Product[]): SearchCategoryConfig | undefined {
  const matches = searchCategoryIds
    .filter((id) => id !== "all")
    .map((id) => searchCategoryRegistry[id])
    .filter((config) => products.some((product) => config.catalogCategories.includes(product.category)));
  return matches.length === 1 ? matches[0] : undefined;
}

function categoryFromKeyword(query: string | undefined): SearchCategoryConfig | undefined {
  const normalized = query?.normalize("NFKC").trim().toLowerCase();
  if (!normalized) return undefined;
  return searchCategoryIds
    .filter((id) => id !== "all")
    .map((id) => searchCategoryRegistry[id])
    .find((config) => config.keywords.some((keyword) => normalized.includes(keyword)));
}

export function resolveSearchContext({
  requestedCategory,
  query,
  catalogMatches,
}: {
  requestedCategory?: SearchCategoryId;
  query?: string;
  catalogMatches: readonly Product[];
}): SearchContext {
  if (requestedCategory !== undefined) return context(getSearchCategory(requestedCategory), "explicit");
  const catalogCategory = categoryFromCatalog(catalogMatches);
  if (catalogCategory) return context(catalogCategory, "catalog");
  const keywordCategory = categoryFromKeyword(query);
  if (keywordCategory) return context(keywordCategory, "keyword");
  return context(searchCategoryRegistry.all, "fallback");
}

export function filterCatalogProductsForContext(products: readonly Product[], searchContext: SearchContext): Product[] {
  if (searchContext.id === "all") return [...products];
  return products.filter((product) => searchContext.catalogCategories.includes(product.category));
}

export function availableCatalogCategories(products: readonly Product[]): SearchCategoryConfig[] {
  return searchCategoryIds
    .filter((id) => id !== "all")
    .map((id) => searchCategoryRegistry[id])
    .filter((config) => products.some((product) => config.catalogCategories.includes(product.category)));
}
