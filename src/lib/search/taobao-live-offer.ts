/** A public product-level Taobao listing, intentionally separate from persisted SKU Offers. */
export type LiveTaobaoProductOffer = {
  productId: string;
  variantId: null;
  itemId: string;
  title: string;
  image: string | null;
  merchant: string;
  /** Normal sale price; never inferred from a conditional promotion. */
  salePrice: number;
  /** Conditional price that may require activity, region, coupon, or subsidy eligibility. */
  promotionPrice: number | null;
  promotionTags: string[];
  productUrl: string | null;
  source: "live";
};
