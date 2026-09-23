import { livePinduoduoOfferFacts } from "@/components/search/presentation";
import type { LivePinduoduoOffer } from "@/lib/search/pinduoduo-live-offer";
import type { Product } from "@/types/catalog";
import { LivePlatformOffers, type LivePlatformListing } from "./live-platform-offers";
import { specificationSummary } from "./specification-summary";

export function LivePinduoduoOffers({ offers, product }: { offers: readonly LivePinduoduoOffer[]; product: Product }) {
  const listings: LivePlatformListing[] = offers.map((offer, index) => {
    const facts = livePinduoduoOfferFacts(offer);
    const variant = offer.productId === product.id && offer.variantId
      ? product.variants.find((candidate) => candidate.id === offer.variantId)
      : undefined;
    const comparable = Boolean(variant);
    return {
      id: `${offer.goodsId}-${index}`,
      title: offer.title,
      image: facts.image,
      merchant: offer.merchant.trim() || null,
      primaryPrice: offer.price,
      primaryPriceLabel: comparable ? "同规格实时价格" : "商品级参考价",
      metadata: facts.salesLabel,
      tags: facts.couponLabels,
      platformLabel: "拼多多",
      confirmedProductName: product.name,
      dataTypeLabel: comparable ? "同规格实时报价" : "商品级参考价",
      specificationNote: comparable
        ? `商品规格：${specificationSummary(product.category, variant)}`
        : "具体规格未确认，不参与同规格最低价、价格筛选、排序或 PriceAI 评分。",
    };
  });
  return <LivePlatformOffers ariaLabel="实时拼多多报价" listings={listings} notice="只有明确绑定当前商品规格的实时价才可参与同规格可比最低价；所有实时报价均不计入 PriceAI 评分。" title="实时拼多多报价" />;
}
