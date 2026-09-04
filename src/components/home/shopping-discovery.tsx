import Link from "next/link";

import { formatPrice } from "@/lib/pricing/offers";
import type { ProductSearchRow } from "@/lib/search/products";

type ShoppingDiscoveryProps = {
  priceFocus: ProductSearchRow[];
  rankedProducts: ProductSearchRow[];
};

function ProductRow({ row, rank }: { row: ProductSearchRow; rank?: number }) {
  return (
    <Link className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-slate-50" href={`/products/${row.product.slug}`}>
      {rank ? <span className="flex size-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">{rank}</span> : <span aria-hidden="true" className="size-2 rounded-full bg-blue-500" />}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950 group-hover:text-blue-700">{row.product.name}</p>
        <p className="mt-0.5 text-xs text-slate-500">{row.product.brand}</p>
      </div>
      <p className="text-right text-sm font-bold text-slate-950">{rank ? `${row.valueScore ?? "—"} 分` : row.lowestOffer ? `${formatPrice(row.lowestOffer.price)} 起` : "暂无报价"}</p>
    </Link>
  );
}

export function ShoppingDiscovery({ priceFocus, rankedProducts }: ShoppingDiscoveryProps) {
  return (
    <section aria-labelledby="shopping-discovery-heading" className="page-shell py-12 sm:py-16">
      <div className="max-w-xl">
        <p className="text-sm font-semibold text-blue-700">继续逛逛</p>
        <h2 className="mt-2 text-2xl font-bold tracking-[-0.035em] text-slate-950 sm:text-3xl" id="shopping-discovery-heading">购物发现</h2>
      </div>
      <div className="mt-7 grid gap-4 lg:grid-cols-2">
        <section className="surface-card p-4 transition-shadow hover:shadow-md hover:shadow-slate-950/5 sm:p-5" aria-labelledby="price-focus-heading">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-950" id="price-focus-heading">价格关注</h3>
              <p className="mt-1 text-sm text-slate-500">当前已收录商品中，低价更值得先看</p>
            </div>
            <Link className="shrink-0 text-sm font-semibold text-emerald-700 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" href="/search?sort=price_asc">看看商品 →</Link>
          </div>
          <div className="mt-3 divide-y divide-slate-100">
            {priceFocus.map((row) => <ProductRow key={row.product.id} row={row} />)}
          </div>
        </section>
        <section className="surface-card p-4 transition-shadow hover:shadow-md hover:shadow-slate-950/5 sm:p-5" aria-labelledby="value-rank-heading">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-950" id="value-rank-heading">性价比榜</h3>
              <p className="mt-1 text-sm text-slate-500">按 PriceAI 评分，看看哪些更值得买</p>
            </div>
            <Link className="text-sm font-semibold text-blue-700 hover:text-blue-800" href="/rankings/phones">查看手机榜单 →</Link>
          </div>
          <div className="mt-3 divide-y divide-slate-100">
            {rankedProducts.map((row, index) => <ProductRow key={row.product.id} rank={index + 1} row={row} />)}
          </div>
        </section>
      </div>
    </section>
  );
}
