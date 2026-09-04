import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PriceHistoryPanel } from "@/components/price-history/price-history-panel";
import { getProductInsight } from "@/lib/ai/product-insight";
import { getProductBySlug } from "@/lib/catalog/repository";
import { getVariantPriceHistoryViewModel } from "@/lib/price-history/service";
import { formatPrice, getLowestOffer } from "@/lib/pricing/offers";
import { scoreVariant } from "@/lib/scoring/value-score";

export const dynamic = "force-dynamic";

function InsightList({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
      {items.map((item) => (
        <li className="flex gap-2" key={item}>
          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const product = await getProductBySlug((await params).slug);
  if (!product) notFound();

  const variant = product.variants[0];
  const lowestOffer = getLowestOffer(variant.offers);
  const score = scoreVariant(variant);
  const [insight, priceHistory] = await Promise.all([
    getProductInsight(product, variant),
    getVariantPriceHistoryViewModel(variant.id),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <p className="text-sm font-medium text-blue-600">{product.brand}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{product.name}</h1>
        <p className="mt-2 text-slate-600">性价比 {score.total}/100</p>

        <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Object.entries(product.specs).map(([label, value]) => (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700" key={label}>
              <dt className="font-medium text-slate-900">{label}</dt>
              <dd className="mt-1">{value}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="offers-heading" className="mt-10">
          <h2 className="text-2xl font-bold text-slate-950" id="offers-heading">
            {variant.storage} · {variant.color} · {variant.region} 比价
          </h2>
          <div className="mt-4 space-y-3">
            {variant.offers.map((offer) => (
              <article className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${offer.id === lowestOffer?.id ? "border-blue-500 bg-blue-50/40" : "border-slate-200"}`} key={offer.id}>
                <p className="text-sm leading-6 text-slate-600">
                  <span className="font-semibold text-slate-950">{offer.platform} · {offer.seller}</span>
                  <br />评分 {offer.rating} · 销量 {offer.sales} · {offer.warranty}
                </p>
                <p className="text-lg font-bold text-slate-950">
                  {formatPrice(offer.price)} {offer.id === lowestOffer?.id && <span className="ml-2 text-sm text-blue-700">当前最低价</span>}
                </p>
              </article>
            ))}
          </div>
        </section>

        <PriceHistoryPanel view={priceHistory} />

        <section aria-labelledby="insight-heading" className="mt-10 rounded-2xl border border-blue-100 bg-blue-50/50 p-5 sm:p-7">
          <p className="text-sm font-semibold text-blue-700">PriceAI</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950" id="insight-heading">AI 购买建议</h2>
          <p className="mt-3 text-base font-medium leading-7 text-slate-800">{insight.verdict}</p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div><h3 className="font-semibold text-slate-950">主要优点</h3><InsightList items={insight.pros} /></div>
            <div><h3 className="font-semibold text-slate-950">主要缺点</h3><InsightList items={insight.cons} /></div>
            <div><h3 className="font-semibold text-slate-950">适合人群</h3><InsightList items={insight.suitableFor} /></div>
            <div><h3 className="font-semibold text-slate-950">不太适合人群</h3><InsightList items={insight.notSuitableFor} /></div>
          </div>
          <div className="mt-6 rounded-xl bg-white/80 p-4">
            <h3 className="font-semibold text-slate-950">购买建议</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{insight.buyingAdvice}</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
