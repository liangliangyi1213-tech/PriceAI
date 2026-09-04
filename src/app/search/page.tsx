import Link from "next/link";

import { SearchFilters } from "@/components/search/search-filters";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getProducts } from "@/lib/catalog/repository";
import { formatPrice } from "@/lib/pricing/offers";
import { parseProductSearchQuery, type SearchParamRecord } from "@/lib/search/query";
import { searchCatalog } from "@/lib/search/products";

export default async function Page({ searchParams }: { searchParams: Promise<SearchParamRecord> }) {
  const searchQuery = parseProductSearchQuery(await searchParams);
  const products = await getProducts();
  const rows = searchCatalog(products, searchQuery);
  const brands = [...new Set(products.map((product) => product.brand))];
  const heading = searchQuery.query ?? "全部手机";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:py-12">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">正在为你搜索：{heading}</h1>
        <div className="mt-2 flex items-center justify-between gap-4 text-sm text-slate-600">
          <p>找到 {rows.length} 款符合条件的手机</p>
          <Link className="font-medium text-blue-700 hover:text-blue-800" href="/search">查看全部</Link>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <SearchFilters brands={brands} searchQuery={searchQuery} />
          <section aria-label="搜索结果">
            {rows.length ? (
              <div className="grid gap-5 sm:grid-cols-2">
                {rows.map((row) => (
                  <article className="rounded-2xl border border-slate-200 bg-white p-5" key={row.product.id}>
                    <div aria-hidden="true" className="text-4xl">📱</div>
                    <p className="mt-3 text-sm font-medium text-blue-600">{row.product.brand}</p>
                    <h2 className="mt-1 text-xl font-semibold text-slate-950">{row.product.name}</h2>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {row.lowestOffer ? `最低价来自${row.lowestOffer.platform} · ${row.lowestOffer.seller}` : "暂无有效平台报价"}
                    </p>
                    <p className="mt-3 text-lg font-bold text-slate-950">
                      {row.lowestOffer ? formatPrice(row.lowestOffer.price) : "暂无报价"}
                      <span className="ml-2 text-sm font-medium text-slate-600">· 性价比 {row.valueScore ?? "—"}</span>
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {row.platformCount} 个平台可用
                      {row.rating !== null && ` · 评分 ${row.rating}`}
                      {row.sales !== null && ` · 销量 ${row.sales}`}
                    </p>
                    <Link className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" href={`/products/${row.product.slug}`}>查看详情</Link>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                <h2 className="text-lg font-semibold text-slate-950">没有找到符合条件的商品</h2>
                <p className="mt-2 text-sm text-slate-600">试试放宽价格、评分或品牌筛选条件。</p>
                <Link className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" href="/search">清除筛选，查看全部商品</Link>
              </div>
            )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
export const dynamic = "force-dynamic";
