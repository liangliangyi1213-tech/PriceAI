import { formatPrice } from "@/lib/pricing/offers";
import type { Offer } from "@/types/catalog";
import { getDetailOffers } from "./product-detail-presentation";

function reliablePurchaseUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function PlatformOffers({ offers }: { offers: Offer[] }) {
  const sorted = getDetailOffers(offers);
  const lowestId = sorted[0]?.id;
  const hasPurchaseLink = sorted.some((offer) => reliablePurchaseUrl(offer.url));
  return (
    <section aria-labelledby="platform-offers-heading" className="mt-8 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7" id="platform-offers">
      <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-sm font-semibold text-blue-700">同一商品规格</p><h2 className="mt-1 text-2xl font-bold text-slate-950" id="platform-offers-heading">平台报价</h2></div><p className="text-sm text-slate-500">{sorted.length} 个有效报价</p></div>
      {!sorted.length ? <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">暂无有效平台报价</p> : <div className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
        {sorted.map((offer) => { const purchaseUrl = reliablePurchaseUrl(offer.url); return <article className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6" key={offer.id}>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-950">{offer.platform}</h3>{offer.id === lowestId ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">当前最低</span> : null}</div>{offer.seller ? <p className="mt-1 truncate text-sm text-slate-600">{offer.seller}</p> : null}<p className="mt-1 text-xs leading-5 text-slate-500">{Number.isFinite(offer.rating) ? `平台评分 ${offer.rating}` : null}{Number.isFinite(offer.rating) && Number.isFinite(offer.sales) ? " · " : null}{Number.isFinite(offer.sales) ? `销量 ${offer.sales.toLocaleString("zh-CN")}` : null}{offer.warranty ? ` · ${offer.warranty}` : null}</p></div>
          <div><p className={`text-xl font-bold tabular-nums ${offer.id === lowestId ? "text-blue-700" : "text-slate-950"}`}>{formatPrice(offer.price)}</p>{offer.originalPrice && offer.originalPrice > 0 ? <p className="mt-1 text-xs text-slate-500">原价 {formatPrice(offer.originalPrice)}</p> : null}</div>
          {purchaseUrl ? <a aria-label={`前往${offer.platform}购买（新标签页）`} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-blue-200 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-50 sm:w-auto" href={purchaseUrl} rel="noopener noreferrer" target="_blank">去购买 <span aria-hidden="true">↗</span></a> : null}
        </article>; })}
      </div>}
      <p className="mt-4 text-xs leading-5 text-slate-500">价格与商品信息以平台页面为准，购买前请再次核对规格。</p>
      {hasPurchaseLink ? <p className="mt-1 text-xs leading-5 text-slate-500">“去购买”将在新标签页打开第三方购物平台，订单、支付、物流与售后由对应平台负责。</p> : null}
    </section>
  );
}
