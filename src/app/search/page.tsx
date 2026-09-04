import Link from "next/link";

import { CompareBar, CompareToggleButton } from "@/components/compare/compare-selection";
import { SearchFilters } from "@/components/search/search-filters";
import { ResultsSearch } from "@/components/search/results-search";
import { ResultsToolbar } from "@/components/search/results-toolbar";
import { SearchProductCard } from "@/components/search/search-product-card";
import { categoryLabel, searchHref } from "@/components/search/presentation";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getProducts } from "@/lib/catalog/repository";
import { parseCompareQuery } from "@/lib/compare/query";
import { parseProductSearchQuery, type SearchParamRecord } from "@/lib/search/query";
import { searchCatalog } from "@/lib/search/products";

export default async function Page({ searchParams }: { searchParams: Promise<SearchParamRecord> }) {
  const currentSearchParams = await searchParams;
  const searchQuery = parseProductSearchQuery(currentSearchParams);
  const products = await getProducts();
  const rows = searchCatalog(products, searchQuery);
  const brands = [...new Set(products.map((product) => product.brand))];
  const categories = [...new Set(products.map((product) => product.category))];
  const productOptions = products.map((product) => ({ slug: product.slug, name: product.name }));
  const compareSlugs = parseCompareQuery(currentSearchParams.compare).filter((slug) => products.some((product) => product.slug === slug));
  const resetHref = searchHref({ query: searchQuery.query, sort: "relevance" }, compareSlugs);
  const allHref = searchHref({ sort: "relevance" }, compareSlugs);

  return (
    <>
      <SiteHeader />
      <ResultsSearch compareSlugs={compareSlugs} query={searchQuery.query} />
      <main className="page-shell min-h-screen pb-12 pt-3">
        <h1 className="flex flex-wrap items-baseline gap-x-2 text-lg font-bold leading-7 tracking-tight text-slate-950 [overflow-wrap:anywhere] sm:text-xl">{searchQuery.query ?? "全部商品"}<span className="text-sm font-normal text-slate-500">· {rows.length} 件商品</span></h1>
        <nav aria-label="已收录品类" className="mt-2 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs text-slate-500">品类</span>
          <Link className="inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700" href={allHref}>全部商品</Link>
          {categories.map((category) => <Link title={`按“${categoryLabel(category)}”关键词搜索`} className="inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700" href={searchHref({ query: categoryLabel(category), sort: "relevance" }, compareSlugs)} key={category}>{categoryLabel(category)}</Link>)}
        </nav>
        <CompareBar productOptions={productOptions} />

        <div className="mt-3 grid gap-3 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-5">
          <SearchFilters brands={brands} compareSlugs={compareSlugs} key={JSON.stringify(searchQuery)} searchQuery={searchQuery} />
          <section aria-label="搜索结果" className="min-w-0">
            <ResultsToolbar compareSlugs={compareSlugs} count={rows.length} query={searchQuery} />
            {rows.length ? (
              <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:gap-5">
                {rows.map((row) => <SearchProductCard key={row.product.id} row={row}><CompareToggleButton productOptions={productOptions} productSlug={row.product.slug} /></SearchProductCard>)}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-14 text-center">
                <p aria-hidden="true" className="text-3xl text-slate-300">⌕</p>
                <h2 className="mt-3 text-lg font-semibold text-slate-950">没有找到符合条件的商品</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">试试更短的关键词，或放宽品牌、价格和性价比分筛选。未收录的商品暂时不会出现在结果中。</p>
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
