import { livePinduoduoOfferFacts } from "@/components/search/presentation";
import type { LivePinduoduoOffer } from "@/lib/search/pinduoduo-live-offer";
import { LivePlatformOffers, type LivePlatformListing } from "./live-platform-offers";

export function LivePinduoduoOffers({ offers }: { offers: readonly LivePinduoduoOffer[] }) {
  const listings: LivePlatformListing[] = offers.map((offer, index) => {
    const facts = livePinduoduoOfferFacts(offer);
    return {
      id: `${offer.goodsId}-${index}`,
      title: offer.title,
      image: facts.image,
      merchant: offer.merchant.trim() || null,
      primaryPrice: offer.price,
      metadata: facts.salesLabel,
      tags: facts.couponLabels,
      platformLabel: "拼多多",
    };
  });
  return <LivePlatformOffers ariaLabel="实时拼多多报价" listings={listings} notice="实时拼多多报价暂未计入 PriceAI 评分" title="实时拼多多报价" />;
}
