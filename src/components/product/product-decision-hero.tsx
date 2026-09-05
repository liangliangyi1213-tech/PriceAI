import type { ReactNode } from "react";
import { PriceAIScore } from "@/components/home/priceai-score";
import { ProductImage } from "@/components/search/product-image";
import { specificationSummary } from "@/components/search/specification-summary";
import { formatPrice, getLowestOffer } from "@/lib/pricing/offers";
import type { Product, ProductVariant } from "@/types/catalog";
import { getDetailPurchaseReference } from "./product-detail-presentation";

export function ProductDecisionHero({ product, variant, score, compareAction }: { product: Product; variant: ProductVariant; score: number; compareAction?: ReactNode }) {
  const lowestOffer = getLowestOffer(variant.offers);
  const specification = specificationSummary(product.category, variant);
  return (
    <section aria-labelledby="product-heading" className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:overflow-visible lg:border-0 lg:bg-transparent lg:shadow-none">
      <div className="grid lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.2fr)] lg:gap-5">
        <div className="border-b border-slate-100 lg:self-start lg:overflow-hidden lg:rounded-3xl lg:border lg:border-slate-200 lg:bg-white lg:shadow-sm"><ProductImage brand={product.brand} name={product.name} src={product.image} /></div>
        <div className="p-5 sm:p-7 lg:rounded-3xl lg:border lg:border-slate-200 lg:bg-white lg:p-8 lg:shadow-sm">
          <p className="text-sm font-semibold text-blue-700">{product.brand}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 [overflow-wrap:anywhere] sm:text-4xl" id="product-heading">{product.name}</h1>
          {specification ? <p className="mt-2 text-sm leading-6 text-slate-600">商品规格：{specification}</p> : null}
          <div className="mt-6">
            <p className="text-sm font-medium text-slate-600">当前已收录最低价</p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-orange-700 sm:text-5xl">{lowestOffer ? formatPrice(lowestOffer.price) : "暂无有效报价"}</p>
          </div>
          <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
            <p className="text-sm font-semibold text-blue-800">购买参考</p>
            <p className="mt-1 text-pretty text-sm leading-6 text-slate-700">{getDetailPurchaseReference(variant)}</p>
          </div>
          <div className="mt-4"><PriceAIScore score={score} size="prominent" /></div>
          {lowestOffer ? <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3"><span className="text-sm font-medium text-slate-600">最低价平台</span><span className="font-semibold text-slate-950">{lowestOffer.platform} · {formatPrice(lowestOffer.price)}</span></div> : null}
          <div className="mt-5 flex flex-wrap items-start gap-3 [&>div]:mt-0">
            <a className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700" href="#platform-offers">查看平台报价</a>
            {compareAction}
          </div>
        </div>
      </div>
    </section>
  );
}
