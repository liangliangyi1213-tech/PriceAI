import Link from "next/link";

import { CompareBar, CompareToggleButton } from "@/components/compare/compare-selection";
import { SearchFilters } from "@/components/search/search-filters";
import { ResultsSearch } from "@/components/search/results-search";
import { ResultsToolbar } from "@/components/search/results-toolbar";
import { LiveSearchOffers } from "@/components/search/live-search-offers";
import { SearchProductCard } from "@/components/search/search-product-card";
import { searchHref } from "@/components/search/presentation";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getProducts } from "@/lib/catalog/repository";
import { parseCompareQuery } from "@/lib/compare/query";
import {
  availableCatalogCategories,
  filterCatalogProductsForContext,
  resolveSearchContext,
  type SearchContext,
} from "@/lib/search/category-context";
import { getLivePinduoduoOffers } from "@/lib/search/pinduoduo-live-service";
import { getLiveTaobaoOffers } from "@/lib/search/taobao-live-service";
import { parseProductSearchQuery, type ProductSearchQuery, type ProductSearchSort, type SearchParamRecord } from "@/lib/search/query";
import { searchCatalog } from "@/lib/search/products";

function supportsSort(sort: ProductSearchSort, context: SearchContext): boolean {
  if (sort === "relevance") return true;
  if (sort === "price_asc" || sort === "price_desc") return context.facets.price;
  if (sort === "score_desc") return context.facets.score;
  if (sort === "rating_desc") return context.facets.rating;
  return context.facets.sales;
}

function queryForContext(query: ProductSearchQuery, context: SearchContext): ProductSearchQuery {
  return {
    ...(query.query ? { query: query.query } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(context.facets.brands && query.brands ? { brands: query.brands } : {}),
    ...(context.facets.price && query.minPrice !== undefined ? { minPrice: query.minPrice } : {}),
    ...(context.facets.price && query.maxPrice !== undefined ? { maxPrice: query.maxPrice } : {}),
    ...(context.facets.score && query.minScore !== undefined ? { minScore: query.minScore } : {}),
    sort: supportsSort(query.sort, context) ? query.sort : "relevance",
  };
}

function emptyStateDescription(context: SearchContext): string {
  if (context.id !== "all" && context.matcher === null) {
    return `当前识别为${context.label}品类。PriceAI 尚未建立完整的${context.label}商品目录和决策模型，暂不展示未经核验的商品或评分。`;
  }
  if (context.id === "all") return "暂未找到已收录商品。可以尝试更具体的商品名称；未建立匹配模型的商品不会被冒充为已核验结果。";
  return "试试更短的关键词，或放宽品牌、价格和性价比分筛选。未收录的商品暂时不会出现在结果中。";
}

export default async function Page({ searchParams }: { searchParams: Promise<SearchParamRecord> }) {
  const currentSearchParams = await searchParams;
  const searchQuery = parseProductSearchQuery(currentSearchParams);
  const products = await getProducts();
  const contextMatches = searchCatalog(products, { query: searchQuery.query, sort: "relevance" }).map((row) => row.product);
  const searchContext = resolveSearchContext({
    requestedCategory: searchQuery.category,
    query: searchQuery.query,
    catalogMatches: contextMatches,
  });
  const scopedProducts = filterCatalogProductsForContext(products, searchContext);
  const effectiveQuery = queryForContext(searchQuery, searchContext);
  const catalogRows = searchCatalog(scopedProducts, effectiveQuery);
  const liveSources = searchQuery.query && searchContext.matcher === "phone"
    ? await Promise.allSettled([
        getLivePinduoduoOffers(scopedProducts, searchQuery.query),
        getLiveTaobaoOffers(catalogRows.map((row) => row.product)),
      ])
    : [];
  const liveOffersByProduct = liveSources[0]?.status === "fulfilled" ? liveSources[0].value : undefined;
  const liveTaobaoOffersByProduct = liveSources[1]?.status === "fulfilled" ? liveSources[1].value : undefined;
  const rows = searchCatalog(scopedProducts, effectiveQuery, liveOffersByProduct, liveTaobaoOffersByProduct);
  const brands = searchContext.facets.brands ? [...new Set(scopedProducts.map((product) => product.brand))] : [];
  const categoryOptions = searchContext.id === "all" ? availableCatalogCategories(products) : [searchContext];
  const productOptions = products.map((product) => ({ slug: product.slug, name: product.name }));
  const compareSlugs = parseCompareQuery(currentSearchParams.compare).filter((slug) => products.some((product) => product.slug === slug));
  const contextualCategory = searchQuery.category ?? searchContext.id;
  const resetHref = searchHref({ query: searchQuery.query, category: contextualCategory, sort: "relevance" }, compareSlugs);
  const allHref = searchHref({ category: "all", sort: "relevance" }, compareSlugs);
  const allCategoryHref = searchHref({ query: searchQuery.query, category: "all", sort: "relevance" }, compareSlugs);
  const hasFilters = Object.values(searchContext.facets).some(Boolean);

  return (
    <>
      <SiteHeader />
      <ResultsSearch compareSlugs={compareSlugs} query={searchQuery.query} />
      <main className="page-shell min-h-screen pb-12 pt-3">
        <h1 className="flex flex-wrap items-baseline gap-x-2 text-lg font-bold leading-7 tracking-tight text-slate-950 [overflow-wrap:anywhere] sm:text-xl">{searchQuery.query ?? "全部商品"}<span className="text-sm font-normal text-slate-500">· {rows.length} 件商品</span></h1>
        <nav aria-label="已收录品类" className="mt-2 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs text-slate-500">品类</span>
          {searchContext.id === "all" ? (
            <span aria-current="page" className="inline-flex min-h-9 items-center rounded-full border border-blue-200 bg-blue-50 px-4 text-xs font-semibold text-blue-700">全部商品</span>
          ) : (
            <Link className="inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700" href={allCategoryHref}>全部商品</Link>
          )}
          {categoryOptions.map((category) => searchContext.id === category.id ? (
            <span aria-current="page" className="inline-flex min-h-9 items-center rounded-full border border-blue-200 bg-blue-50 px-4 text-xs font-semibold text-blue-700" key={category.id}>{category.label}</span>
          ) : (
            <Link className="inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700" href={searchHref({ query: searchQuery.query, category: category.id, sort: "relevance" }, compareSlugs)} key={category.id}>{category.label}</Link>
          ))}
        </nav>
        <CompareBar productOptions={productOptions} />

        <div className={`mt-3 grid gap-3 ${hasFilters ? "lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-5" : "grid-cols-1"}`}>
          <SearchFilters brands={brands} compareSlugs={compareSlugs} facets={searchContext.facets} key={JSON.stringify(effectiveQuery)} searchQuery={effectiveQuery} />
          <section aria-label="搜索结果" className="min-w-0">
            <ResultsToolbar compareSlugs={compareSlugs} count={rows.length} facets={searchContext.facets} query={effectiveQuery} />
            {rows.length ? (
              <div className="grid items-stretch gap-5">
                {rows.map((row) => (
                  <div className="grid min-w-0 gap-3" key={row.product.id}>
                    <SearchProductCard row={row}><CompareToggleButton productOptions={productOptions} productSlug={row.product.slug} /></SearchProductCard>
                    <LiveSearchOffers pinduoduoOffers={row.livePinduoduoOffers} productName={row.product.name} taobaoOffers={row.liveTaobaoOffers} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-14 text-center">
                <p aria-hidden="true" className="text-3xl text-slate-300">⌕</p>
                <h2 className="mt-3 text-lg font-semibold text-slate-950">没有找到符合条件的商品</h2>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{emptyStateDescription(searchContext)}</p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Link className="inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700" href={resetHref}>清除筛选</Link>
                  <Link className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50" href={allHref}>浏览全部商品</Link>
                </div>
              </div>
            )}
            <p className="mt-6 text-xs leading-6 text-slate-500">比价说明：仅比较已收录的商品和报价，不代表全网最低价。卡片中的平台报价对应同一规格；购买建议仅作价格参考。不同规格价格可能不同，购买前请核对平台页面。</p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
export const dynamic = "force-dynamic";
