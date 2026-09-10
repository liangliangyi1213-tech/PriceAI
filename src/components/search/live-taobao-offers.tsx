import type { LiveTaobaoProductOffer } from "@/lib/search/taobao-live-offer";

import { LivePlatformOffers, type LivePlatformListing } from "./live-platform-offers";

function listing(offer: LiveTaobaoProductOffer): LivePlatformListing {
  return {
    id: offer.itemId,
    title: offer.title,
    image: offer.image,
    merchant: offer.merchant,
    primaryPrice: offer.salePrice,
    primaryPriceLabel: "常规成交价",
    ...(offer.promotionPrice !== null ? {
      secondaryPrice: offer.promotionPrice,
      secondaryPriceLabel: "优惠后",
      conditionNote: "需满足活动/地区/领券等条件",
    } : {}),
    tags: offer.promotionTags,
    href: offer.productUrl,
    actionLabel: "去淘宝看看",
  };
}

export function LiveTaobaoOffers({ offers }: { offers: readonly LiveTaobaoProductOffer[] }) {
  return <LivePlatformOffers
    ariaLabel="实时淘宝报价"
    listings={offers.map(listing)}
    notice="淘宝实时商品为商品级结果，未确认具体规格，暂未计入 PriceAI 评分或最低价。"
    title="实时淘宝报价"
  />;
}
