import Image from "next/image";

import { livePinduoduoOfferFacts } from "@/components/search/presentation";
import { formatPrice } from "@/lib/pricing/offers";
import type { LivePinduoduoOffer } from "@/lib/search/pinduoduo-live-offer";

export function LivePinduoduoOffers({ offers }: { offers: readonly LivePinduoduoOffer[] }) {
  if (!offers.length) return null;

  return (
    <section aria-label="实时拼多多报价" className="border-t border-slate-100 pt-3">
      <h4 className="text-sm font-semibold text-slate-800">实时拼多多报价</h4>
      <p className="mt-1 text-xs leading-5 text-amber-700">实时拼多多报价暂未计入 PriceAI 评分</p>
      <ul className="mt-2 grid min-w-0 gap-2">
        {offers.map((offer, index) => {
          const facts = livePinduoduoOfferFacts(offer);
          const merchant = offer.merchant.trim();
          return (
            <li className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5" key={`${offer.goodsId}-${index}`}>
              <div className={facts.image ? "grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-2.5" : "min-w-0"}>
                {facts.image ? (
                  <div className="relative h-14 w-14 overflow-hidden rounded-lg bg-white">
                    <Image alt={offer.title} className="object-contain" fill sizes="56px" src={facts.image} unoptimized />
                  </div>
                ) : null}
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium leading-5 text-slate-800 [overflow-wrap:anywhere]">{offer.title}</p>
                  {merchant ? <p className="mt-0.5 break-words text-xs leading-5 text-slate-500 [overflow-wrap:anywhere]">商家：{merchant}</p> : null}
                  <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    {Number.isFinite(offer.price) && offer.price > 0 ? <span className="shrink-0 font-semibold tabular-nums text-orange-700">{formatPrice(offer.price)}</span> : null}
                    {facts.salesLabel ? <span className="min-w-0 break-words text-xs text-slate-500 [overflow-wrap:anywhere]">{facts.salesLabel}</span> : null}
                  </div>
                  {facts.couponLabels.length ? (
                    <div aria-label="优惠信息" className="mt-1.5 flex min-w-0 flex-wrap gap-1">
                      {facts.couponLabels.map((label) => <span className="max-w-full break-words rounded bg-orange-50 px-1.5 py-0.5 text-[11px] leading-4 text-orange-700" key={label}>{label}</span>)}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
