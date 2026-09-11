import Link from "next/link";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { rankingCategories, type RankingCategory } from "@/lib/ranking/categories";

function RankingCard({ category }: { category: RankingCategory }) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{category.label}</span>
        {category.status === "available" ? (
          <span className="text-sm font-semibold text-blue-700">查看榜单 →</span>
        ) : (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">即将支持</span>
        )}
      </div>
      <h2 className="mt-5 text-xl font-bold tracking-tight text-slate-950">{category.title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{category.description}</p>
    </>
  );

  if (category.href) {
    return (
      <Link className="group block min-h-48 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" href={category.href}>
        {content}
      </Link>
    );
  }

  return <article className="min-h-48 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">{content}</article>;
}

export default function RankingsPage() {
  return (
    <>
      <SiteHeader />
      <main className="page-shell min-h-[calc(100vh-9rem)] py-10 sm:py-14">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-blue-700">购物决策榜单</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">PriceAI 榜单</h1>
          <p className="mt-4 text-base leading-7 text-slate-600">按品类查看 PriceAI 基于已收录商品事实计算的榜单。尚未建立完整数据与评分模型的品类不会生成虚假排名。</p>
        </div>
        <section aria-label="榜单分类" className="mt-8 grid gap-4 sm:grid-cols-2">
          {rankingCategories.map((category) => <RankingCard category={category} key={category.id} />)}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
