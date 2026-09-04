import { describe, expect, it } from "vitest";
import { phones } from "@/data/phones";
import { searchCatalog } from "@/lib/search/products";
import * as presentation from "./presentation";

describe("search presentation", () => {
  it("bases the opinion on the next-lowest same-variant platform, not the highest", () => {
    const row = searchCatalog([phones[0]], { sort: "relevance" })[0];
    expect(presentation.purchaseOpinion(row)).toBe("同规格最低价比第二低价低 ¥200，可以优先比较。");
  });
  it("does not claim all platforms have equal prices when only the two cheapest tie", () => {
    const product = structuredClone(phones[0]);
    product.variants[0].offers[1].price = 7599;
    expect(presentation.purchaseOpinion(searchCatalog([product], { sort: "relevance" })[0]))
      .toBe("多个平台同为最低报价，建议核对服务与购买条件。");
  });
  it("does not invent a price advantage from one platform or missing data", () => {
    const product = structuredClone(phones[0]);
    product.variants = [{ ...product.variants[0], offers: [product.variants[0].offers[0]] }];
    expect(presentation.purchaseOpinion(searchCatalog([product], { sort: "relevance" })[0]))
      .toBe("仅收录 1 个平台报价，建议再作比较。");
    product.variants = [];
    expect(presentation.purchaseOpinion(searchCatalog([product], { sort: "relevance" })[0]))
      .toBe("暂无有效报价，暂不作购买判断。");
  });
  it("keeps query, filters and compare selections when sorting", () => {
    expect(presentation.searchHref({ query: "茶 & 杯", brands: ["A", "B"], minPrice: 0, maxPrice: 500, minScore: 70, sort: "relevance" }, ["a", "b"], { sort: "price_asc" }))
      .toBe("/search?q=%E8%8C%B6+%26+%E6%9D%AF&brand=A&brand=B&minPrice=0&maxPrice=500&minScore=70&sort=price_asc&compare=a&compare=b");
  });
  it("clears only filters while preserving keyword and comparison", () => {
    expect(presentation.searchHref({ query: "杯", sort: "relevance" }, ["a"]))
      .toBe("/search?q=%E6%9D%AF&sort=relevance&compare=a");
  });
  it("shows all valid platforms for the lowest-price variant, not mixed specifications", () => {
    const product = structuredClone(phones[0]);
    product.variants[1].offers[0].price = 100;
    product.variants[1].offers.push({ ...product.variants[1].offers[0], id: "invalid", platform: "无效", price: 0 });
    const row = searchCatalog([product], { sort: "relevance" })[0];
    const detail = presentation.productCardDetails(row);
    expect(detail.variant?.id).toBe(product.variants[1].id);
    expect(detail.offers.map((offer) => [offer.platform, offer.price])).toEqual([["京东", 100], ["拼多多", 8499], ["淘宝", 8699]]);
  });
  it("deduplicates each platform using its lowest valid price without mutating catalog", () => {
    const product = structuredClone(phones[0]);
    product.variants[0].offers.push({ ...product.variants[0].offers[0], id: "cheaper", price: 500 });
    const before = JSON.stringify(product);
    const detail = presentation.productCardDetails(searchCatalog([product], { sort: "relevance" })[0]);
    expect(detail.offers.map((offer) => offer.price)).toEqual([500, 7599, 7799]);
    expect(JSON.stringify(product)).toBe(before);
  });
  it("returns no prices or variant when no valid offer exists", () => {
    const product = { ...phones[0], variants: [] };
    expect(presentation.productCardDetails(searchCatalog([product], { sort: "relevance" })[0])).toEqual({ variant: undefined, offers: [] });
  });
  it("uses generic category labels for new categories", () => {
    expect(presentation.categoryLabel("phone")).toBe("手机");
    expect(presentation.categoryLabel("家居生活")).toBe("家居生活");
  });
});
