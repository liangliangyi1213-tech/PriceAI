import Link from "next/link";

import { CompareTable } from "@/components/compare/compare-table";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getProducts } from "@/lib/catalog/repository";
import { buildCompareProducts } from "@/lib/compare/compare-products";
import { parseCompareQuery } from "@/lib/compare/query";

type CompareSearchParams = {
  products?: string | string[];
};

export const dynamic = "force-dynamic";

export default async function ComparePage({ searchParams }: { searchParams: Promise<CompareSearchParams> }) {
  const requestedSlugs = parseCompareQuery((await searchParams).products);
  const comparedProducts = buildCompareProducts(await getProducts(), requestedSlugs);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:py-12">
        <p className="text-sm font-semibold text-blue-700">PriceAI</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">商品对比</h1>
        <p className="mt-2 text-slate-600">把价格、商品信息和评分放在一起看。仅展示已收录数据，购买前请核对商品规格。</p>

        {comparedProducts.length >= 2 ? (
          <section aria-label="商品对比表格" className="mt-8">
            <CompareTable products={comparedProducts} />
          </section>
        ) : (
          <section className="mt-8 rounded-2xl border border-dashed border-slate-300 p-8 text-center">
            <h2 className="text-lg font-semibold text-slate-950">请选择至少 2 款有效商品进行对比</h2>
            <p className="mt-2 text-sm text-slate-600">可在搜索结果中加入 2 至 4 款商品，再开始对比。</p>
            <Link className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" href="/search">返回搜索商品</Link>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
