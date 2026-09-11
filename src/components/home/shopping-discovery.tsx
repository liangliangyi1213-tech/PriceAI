import Link from "next/link";

import type { DiscoveryItem } from "@/lib/home/home-feed";

export function ShoppingDiscovery({ items }: { items: DiscoveryItem[] }) {
  return (
    <section aria-labelledby="shopping-discovery-heading" className="page-shell py-12 sm:py-16">
      <div className="flex items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-blue-700">按决策线索继续探索</p>
          <h2 className="mt-2 text-2xl font-bold tracking-[-0.035em] text-slate-950 sm:text-3xl" id="shopping-discovery-heading">购物发现</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">从当前已有的商品与报价事实中，发现值得继续了解的选择。</p>
        </div>
        <Link className="hidden shrink-0 text-sm font-semibold text-blue-700 hover:text-blue-800 sm:inline" href="/rankings">探索榜单 →</Link>
      </div>

      <div
        className="scrollbar-none -mx-4 mt-7 flex touch-pan-x snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto overscroll-x-contain px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4"
        data-mobile-scroll="contained"
      >
        {items.map((item) => (
          <Link
            className="surface-card group flex min-w-[calc(100%-2rem)] max-w-[20rem] snap-start flex-col p-5 transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:min-w-0 sm:max-w-none"
            data-discovery-item={item.reasonType}
            href={item.href}
            key={item.id}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{item.reasonType}</span>
              <span className="text-xs font-medium text-slate-500">{item.category}</span>
            </div>
            <h3 className="mt-5 line-clamp-2 text-lg font-bold tracking-[-0.025em] text-slate-950 group-hover:text-blue-700">{item.title}</h3>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{item.reasonText}</p>
            <span className="mt-auto pt-6 text-sm font-semibold text-blue-700">查看决策信息 →</span>
          </Link>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400 sm:hidden">左右滑动查看更多发现</p>
      <Link className="mt-5 inline-flex text-sm font-semibold text-blue-700 sm:hidden" href="/rankings">探索榜单 →</Link>
    </section>
  );
}
