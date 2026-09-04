import { describe, expect, it } from "vitest";

import { phones } from "@/data/phones";
import type { Product } from "@/types/catalog";

import { parseProductSearchQuery } from "./query";
import { searchCatalog } from "./products";

function productWithoutOffers(): Product {
  const source = phones[0];
  return {
    ...source,
    id: "unavailable-phone",
    slug: "unavailable-phone",
    name: "无报价测试手机",
    variants: source.variants.map((variant) => ({ ...variant, id: `${variant.id}-empty`, offers: [] })),
  };
}

describe("ProductSearchQuery parsing", () => {
  it("safely normalizes supported URL parameters", () => {
    expect(parseProductSearchQuery({
      q: "  iPhone   16 ",
      brand: ["Apple", "Xiaomi, Apple"],
      minPrice: "5000",
      maxPrice: "10000",
      minScore: "70",
      sort: "price_asc",
    })).toEqual({
      query: "iPhone 16",
      brands: ["Apple", "Xiaomi"],
      minPrice: 5000,
      maxPrice: 10000,
      minScore: 70,
      sort: "price_asc",
    });
  });

  it("falls back safely for invalid URL parameters", () => {
    expect(parseProductSearchQuery({
      q: "   ",
      brand: ",,Apple,,",
      minPrice: "not-a-number",
      maxPrice: "-1",
      minScore: "101",
      sort: "unexpected",
    })).toEqual({ brands: ["Apple"], sort: "relevance" });
  });

  it("drops an invalid price range instead of throwing", () => {
    expect(parseProductSearchQuery({ minPrice: "10000", maxPrice: "5000" })).toEqual({ sort: "relevance" });
  });
});

describe("searchCatalog", () => {
  it("matches product names regardless of case or extra spaces", () => {
    const rows = searchCatalog(phones, { query: "  IPHONE   16 ", sort: "relevance" });

    expect(rows.map((row) => row.product.slug)).toEqual([
      "apple-iphone-16",
      "apple-iphone-16-pro",
    ]);
  });

  it("matches compact product names and variant/specification text", () => {
    expect(searchCatalog(phones, { query: "iphone16", sort: "relevance" }).map((row) => row.product.slug))
      .toContain("apple-iphone-16");
    expect(searchCatalog(phones, { query: "512gb", sort: "relevance" }).map((row) => row.product.slug))
      .toContain("apple-iphone-16-pro");
    expect(searchCatalog(phones, { query: "a18pro", sort: "relevance" }).map((row) => row.product.slug))
      .toContain("apple-iphone-16-pro");
  });

  it("filters one or many brands together with the keyword query", () => {
    expect(searchCatalog(phones, { query: "手机", brands: ["Apple"], sort: "relevance" })
      .map((row) => row.product.brand)).toEqual(["Apple", "Apple"]);
    expect(searchCatalog(phones, { brands: ["Apple", "OPPO"], sort: "relevance" })
      .map((row) => row.product.brand)).toEqual(["Apple", "OPPO", "Apple"]);
  });

  it("filters by the product's lowest valid offer price", () => {
    expect(searchCatalog(phones, { minPrice: 5000, sort: "price_asc" })
      .every((row) => row.lowestOffer !== undefined && row.lowestOffer.price >= 5000)).toBe(true);
    expect(searchCatalog(phones, { maxPrice: 3000, sort: "price_asc" })
      .map((row) => row.product.slug)).toEqual(["xiaomi-redmi-k80"]);
    expect(searchCatalog(phones, { minPrice: 3000, maxPrice: 5000, sort: "price_asc" })
      .map((row) => row.product.slug)).toEqual(["oppo-find-x8", "vivo-x200", "xiaomi-15", "huawei-pura-70"]);
  });

  it("filters with the existing value score without creating another scoring formula", () => {
    const rows = searchCatalog(phones, { minScore: 80, sort: "score_desc" });

    expect(rows).not.toHaveLength(0);
    expect(rows.every((row) => row.valueScore !== null && row.valueScore >= 80)).toBe(true);
    expect(rows[0].product.slug).toBe("xiaomi-redmi-k80");
  });

  it("combines keyword, brand, price, and score constraints", () => {
    const rows = searchCatalog(phones, {
      query: "手机",
      brands: ["小米"],
      minPrice: 2000,
      maxPrice: 4500,
      minScore: 80,
      sort: "score_desc",
    });

    expect(rows.map((row) => row.product.slug)).toEqual(["xiaomi-redmi-k80", "xiaomi-15"]);
  });

  it("sorts predictably by lowest price and score", () => {
    expect(searchCatalog(phones, { sort: "price_asc" })[0].product.slug).toBe("xiaomi-redmi-k80");
    expect(searchCatalog(phones, { sort: "price_desc" })[0].product.slug).toBe("apple-iphone-16-pro");
    expect(searchCatalog(phones, { sort: "score_desc" })[0].product.slug).toBe("xiaomi-redmi-k80");
  });

  it("sorts rating and sales using actual offer values", () => {
    const highRating = {
      ...phones[0],
      id: "high-rating",
      variants: [{ ...phones[0].variants[0], offers: [{ ...phones[0].variants[0].offers[0], price: 1000, rating: 4.9, sales: 10 }] }],
    };
    const highSales = {
      ...phones[1],
      id: "high-sales",
      variants: [{ ...phones[1].variants[0], offers: [{ ...phones[1].variants[0].offers[0], price: 1100, rating: 4.2, sales: 99999 }] }],
    };

    expect(searchCatalog([highRating, highSales], { sort: "rating_desc" })[0].product.id).toBe("high-rating");
    expect(searchCatalog([highRating, highSales], { sort: "sales_desc" })[0].product.id).toBe("high-sales");
  });

  it("keeps products without valid offers unpriced and last in offer-based sorting", () => {
    const rows = searchCatalog([productWithoutOffers(), phones[0]], { sort: "price_asc" });

    expect(rows[1]).toMatchObject({ product: { id: "unavailable-phone" }, lowestOffer: undefined, valueScore: null });
    expect(searchCatalog([productWithoutOffers()], { minPrice: 1, sort: "relevance" })).toEqual([]);
  });

  it("returns an empty state result when no product matches", () => {
    expect(searchCatalog(phones, { query: "不存在的型号", sort: "relevance" })).toEqual([]);
  });
});
