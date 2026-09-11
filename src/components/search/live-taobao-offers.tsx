import type { LiveTaobaoProductOffer } from "@/lib/search/taobao-live-offer";
import { prepareLiveTaobaoOffers } from "@/lib/search/taobao-live-presentation";

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
      secondaryPriceLabel: "优惠后（条件优惠价）",
      conditionNote: "需满足活动/地区/领券等条件",
    } : {}),
    tags: offer.promotionTags,
    href: offer.productUrl,
    actionLabel: "去淘宝看看",
    platformLabel: "淘宝",
  };
}

export function LiveTaobaoOffers({ offers }: { offers: readonly LiveTaobaoProductOffer[] }) {
  const preparedOffers = prepareLiveTaobaoOffers(offers);
  const remainingCount = Math.max(0, preparedOffers.length - 3);
  return <LivePlatformOffers
    ariaLabel="实时淘宝报价"
    collapseLabel="收起淘宝报价"
    defaultVisibleCount={3}
    expandLabel={`查看其余 ${remainingCount} 条淘宝报价`}
    listings={preparedOffers.map(listing)}
    notice="淘宝实时商品为商品级结果，未确认具体规格，暂未计入 PriceAI 评分或最低价。"
    title="实时淘宝报价"
  />;
}
