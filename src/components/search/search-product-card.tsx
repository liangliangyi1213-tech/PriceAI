import Link from "next/link";
import type { ReactNode } from "react";
import { PriceAIScore } from "@/components/home/priceai-score";
import { formatPrice } from "@/lib/pricing/offers";
import type { ProductSearchRow } from "@/lib/search/products";
import type { Offer } from "@/types/catalog";
import { categoryLabel, productCardDetails, purchaseOpinion } from "./presentation";
import { ProductImage } from "./product-image";
import { specificationSummary } from "./specification-summary";

function OfferRow({ offer, lowestId }: { offer: Offer; lowestId?: string }) {
  return <li className="flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 break-words text-slate-600">{offer.platform}</span><span className={`shrink-0 tabular-nums ${offer.id === lowestId ? "font-bold text-blue-700" : "font-medium text-slate-700"}`}>{formatPrice(offer.price)}</span></li>;
}

export function SearchProductCard({ row, children }: { row: ProductSearchRow; children?: ReactNode }) {
  const { product, lowestOffer } = row;
  const { variant, offers } = productCardDetails(row);
  const href = `/products/${product.slug}`;
  const specification = specificationSummary(product.category, variant);
  const defaultVariant = product.variants[0];
  const differentDetailVariant = variant && defaultVariant && variant.id !== defaultVariant.id;
  const defaultSpecification = specificationSummary(product.category, defaultVariant);
  const updatedAt = lowestOffer?.updatedAt;
  const updatedLabel = updatedAt && Number.isFinite(Date.parse(updatedAt))
    ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "numeric", day: "numeric" }).format(new Date(updatedAt))
    : null;

  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:border-blue-200 hover:shadow-md">
      <Link aria-label={`查看 ${product.name}`} className="relative block focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-blue-600" href={href} prefetch={false}>
        <ProductImage brand={product.brand} name={product.name} src={product.image} />
        <span className="absolute left-3 top-3 rounded-full border border-white bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-600">{categoryLabel(product.category)}</span>
      </Link>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <p className="mb-1 text-xs font-medium text-slate-500">{product.brand}</p>
        <h3 className="text-xl font-bold leading-7 tracking-tight text-slate-950 [overflow-wrap:anywhere]">
          <Link className="hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600" href={href} prefetch={false}>{product.name}</Link>
        </h3>
        {specification ? <p className="mt-1 text-xs leading-5 text-slate-500">商品规格：{specification}</p> : null}

        <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-3xl font-bold tracking-tight text-orange-700">{lowestOffer ? formatPrice(lowestOffer.price) : <span className="text-lg text-slate-600">暂无有效报价</span>}</p>
          <span className="text-xs text-slate-500">当前已收录最低价</span>
        </div>

        <div className="mt-3"><PriceAIScore score={row.valueScore} size="prominent" /></div>
        <div className="py-3">
          <p className="text-sm font-semibold text-blue-800" title="根据同一规格的已收录报价比较，不代表评分的全部依据。">购买参考</p>
          <p className="mt-1 text-pretty text-sm leading-6 text-slate-600">{purchaseOpinion(row)}</p>
        </div>

        {offers.length ? (
          <div className="border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-medium text-slate-600">同规格 · {offers.length} 个平台报价</p>
            <ul className="grid gap-1.5">
              {offers.slice(0, 3).map((offer) => <OfferRow key={offer.platform} lowestId={lowestOffer?.id} offer={offer} />)}
            </ul>
            {offers.length > 3 ? <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3 text-xs text-blue-700">展开其余 {offers.length - 3} 个平台报价</summary><ul className="mt-1 grid gap-1.5">{offers.slice(3).map((offer) => <OfferRow key={offer.platform} lowestId={lowestOffer?.id} offer={offer} />)}</ul></details> : null}
          </div>
        ) : null}
        <div className="mt-auto pt-3">
          {differentDetailVariant ? <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-800">详情与历史记录默认展示：{defaultSpecification}，与本卡报价规格不同</p> : null}
          <Link className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-slate-600 hover:text-blue-700" href={`${href}#price-history-heading`} prefetch={false}>{differentDetailVariant ? "查看默认规格历史价格" : "查看历史价格"} <span aria-hidden="true">↗</span></Link>
          <p className="text-[11px] leading-5 text-slate-400">{updatedLabel ? <><time dateTime={updatedAt}>{updatedLabel}</time> 报价更新 · </> : null}价格以平台页面为准</p>
          <div className="mt-3 flex flex-wrap items-end gap-x-2 border-t border-slate-100 pt-1">
            <Link className="mt-3 inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" href={href} prefetch={false}>查看详情与比价</Link>
            {children}
          </div>
        </div>
      </div>
    </article>
  );
}
