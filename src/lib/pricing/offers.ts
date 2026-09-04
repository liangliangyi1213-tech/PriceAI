import type { Offer } from "@/types/catalog";

export function hasValidOfferPrice(offer: Offer): boolean {
  return Number.isFinite(offer.price) && offer.price > 0;
}

export function getLowestOffer(offers: Offer[]): Offer | undefined {
  return offers.reduce<Offer | undefined>((lowest, offer) => {
    if (!hasValidOfferPrice(offer)) return lowest;
    return !lowest || offer.price < lowest.price ? offer : lowest;
  }, undefined);
}

export const formatPrice = (price: number) => `¥${price.toLocaleString("zh-CN")}`;
