import { describe, expect, it } from "vitest";
import { phones } from "../data/phones";
import { searchProducts } from "./search/products";
import { getLowestOffer } from "./pricing/offers";
import { scoreVariant } from "./scoring/value-score";
import { sortProducts } from "./ranking/products";

describe("catalog decision logic", () => {
  it("finds products by case-insensitive brand, name, and keyword", () => {
    expect(searchProducts(phones, "iphone").map((product) => product.slug)).toContain("apple-iphone-16-pro");
    expect(searchProducts(phones, "Mate").map((product) => product.brand)).toContain("华为");
  });
  it("finds the lowest matching offer for a single SKU", () => {
    const variant = phones[0].variants[0];
    expect(getLowestOffer(variant.offers)?.platform).toBe("拼多多");
  });
  it("returns a bounded programmatic value score", () => {
    const result = scoreVariant(phones[0].variants[0]);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });
  it("sorts product rows by selected criterion", () => {
    const rows = phones.map((product) => ({ product, score: scoreVariant(product.variants[0]).total }));
    expect(sortProducts(rows, "price")[0].product.slug).toBe("xiaomi-redmi-k80");
  });
});
