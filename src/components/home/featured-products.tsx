import Link from "next/link";
import type { HomeRecommendationFeed } from "@/lib/home/home-feed";
import { formatPrice } from "@/lib/pricing/offers";

import { PriceAIScore } from "./priceai-score";
import { ProductImagePlaceholder } from "./product-image-placeholder";

export function FeaturedProducts({ feed }: { feed: HomeRecommendationFeed }) {
  return (
    <section aria-labelledby="featured-heading" className="page-shell py-12 sm:py-16">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">{feed.eyebrow}</p>
          <h2 className="mt-2 text-2xl font-bold tracking-[-0.035em] text-slate-950 sm:text-3xl" id="featured-heading">{feed.heading}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{feed.description}</p>
        </div>
        <Link className="hidden shrink-0 text-sm font-semibold text-blue-700 hover:text-blue-800 sm:inline" href="/rankings">查看榜单 →</Link>
      </div>
      <div
        className="scrollbar-none -mx-4 mt-7 flex touch-pan-x snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto overscroll-x-contain px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4"
        data-mobile-scroll="contained"
      >
        {feed.items.map((row) => {
          const primaryVariant = row.product.variants[0];
          const availabilityLabel = row.platformCount > 1 ? "多平台可比" : "已收录报价";
          return (
            <Link
              className="surface-card group flex min-w-[calc(100%-2rem)] max-w-[20rem] snap-start flex-col overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/5 sm:min-w-0 sm:max-w-none"
              href={`/products/${row.product.slug}`}
              key={row.product.id}
            >
              <ProductImagePlaceholder brand={row.product.brand} name={row.product.name} />
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-600">{row.product.brand}</p>
                  <span className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{availabilityLabel}</span>
                </div>
                <h3 className="mt-2 text-lg font-bold tracking-[-0.025em] text-slate-950 group-hover:text-blue-700">{row.product.name}</h3>
                {primaryVariant?.storage ? <p className="mt-1 text-sm text-slate-500">{primaryVariant.storage}</p> : null}
                <div className="mt-5 flex items-end justify-between gap-2 border-t border-slate-100 pt-4">
                  <div>
                  <p className="text-xl font-bold text-slate-950">{row.lowestOffer ? `${formatPrice(row.lowestOffer.price)} 起` : "暂无报价"}</p>
                    <p className="mt-1 text-xs text-slate-500">当前已收录报价</p>
                  </div>
                  <PriceAIScore score={row.valueScore} size="compact" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-400 sm:hidden">左右滑动查看更多商品</p>
      <Link className="mt-5 inline-flex text-sm font-semibold text-blue-700 sm:hidden" href="/rankings">查看榜单 →</Link>
    </section>
  );
}
