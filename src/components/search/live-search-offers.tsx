import type { LivePinduoduoOffer } from "@/lib/search/pinduoduo-live-offer";
import type { LiveTaobaoProductOffer } from "@/lib/search/taobao-live-offer";

import { LivePinduoduoOffers } from "./live-pinduoduo-offers";
import { LiveTaobaoOffers } from "./live-taobao-offers";

export function LiveSearchOffers({
  pinduoduoOffers,
  taobaoOffers,
  productName,
}: {
  pinduoduoOffers: readonly LivePinduoduoOffer[];
  taobaoOffers: readonly LiveTaobaoProductOffer[];
  productName: string;
}) {
  if (!pinduoduoOffers.length && !taobaoOffers.length) return null;

  return (
    <section aria-label="实时平台报价" className="min-w-0 rounded-2xl border border-blue-100 bg-blue-50/35 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold text-slate-950">实时平台报价</h3>
        <p className="text-xs text-slate-500">独立商品级信息，仅供进一步核对</p>
      </div>
      <div className="grid min-w-0 gap-5">
        <LivePinduoduoOffers offers={pinduoduoOffers} productName={productName} />
        <LiveTaobaoOffers offers={taobaoOffers} productName={productName} />
      </div>
    </section>
  );
}
