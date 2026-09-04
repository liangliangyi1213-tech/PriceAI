import Link from "next/link";

import { formatPrice } from "@/lib/pricing/offers";
import type { ProductSearchRow } from "@/lib/search/products";

import { PriceAIScore } from "./priceai-score";
import { ProductImagePlaceholder } from "./product-image-placeholder";

export function HeroDiscovery({ products }: { products: ProductSearchRow[] }) {
  return (
    <aside aria-labelledby="hero-discovery-heading" className="surface-card overflow-hidden bg-white/90 p-4 shadow-[0_18px_50px_-34px_rgba(37,99,235,0.5)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950" id="hero-discovery-heading">今日值得关注</p>
          <p className="mt-1 text-xs text-slate-500">从当前已收录商品中挑选</p>
        </div>
        <Link className="text-xs font-semibold text-blue-700 hover:text-blue-800" href="/rankings/phones">看榜单 →</Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {products.slice(0, 2).map((row) => (
          <Link
            className="group flex min-w-0 items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-slate-50"
            href={`/products/${row.product.slug}`}
            key={row.product.id}
          >
            <ProductImagePlaceholder brand={row.product.brand} className="w-24 shrink-0" name={row.product.name} />
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">{row.product.brand}</p>
              <h2 className="mt-1 truncate text-sm font-bold tracking-[-0.02em] text-slate-950 group-hover:text-blue-700">{row.product.name}</h2>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-base font-bold text-slate-950">{row.lowestOffer ? `${formatPrice(row.lowestOffer.price)} 起` : "暂无报价"}</p>
                <PriceAIScore score={row.valueScore} showLabel={false} size="compact" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </aside>
  );
}
