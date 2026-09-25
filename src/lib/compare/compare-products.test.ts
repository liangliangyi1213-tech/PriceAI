import { describe, expect, it } from "vitest";

import { phones } from "@/data/phones";

import { buildCompareProducts, getBestCompareValue } from "./compare-products";
import { parseCompareQuery } from "./query";

describe("compare query", () => {
  it("parses two products in URL order", () => {
    expect(parseCompareQuery("apple-iphone-16-pro,xiaomi-15")).toEqual([
      "apple-iphone-16-pro",
      "xiaomi-15",
    ]);
  });

  it("deduplicates and limits URL products to four", () => {
    expect(parseCompareQuery("a,b,a,c,d,e")).toEqual(["a", "b", "c", "d"]);
  });
});

describe("buildCompareProducts", () => {
  it("builds a two-product comparison from the existing catalog", () => {
    const rows = buildCompareProducts(phones, ["apple-iphone-16-pro", "xiaomi-15"]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      slug: "apple-iphone-16-pro",
      chip: "A18 Pro",
      storage: "256GB",
      lowestPrice: 7599,
      lowestPricePlatform: "拼多多",
      comparedSpecification: "256GB · 黑色 · 国行 · 全新",
      lowestPriceSourceLabel: "演示数据，非实时平台价格",
      scoreSourceLabel: "评分包含演示 Catalog 报价，仅供参考，不代表实时购买结论。",
      offerCount: 6,
    });
  });

  it("keeps the displayed comparison specification aligned with the variant that supplies price and score", () => {
    const product = structuredClone(phones[0]);
    product.variants[1].offers[0].price = 100;
    const [row] = buildCompareProducts([product], [product.slug]);

    expect(row.lowestPrice).toBe(100);
    expect(row.storage).toBe(product.variants[1].storage);
    expect(row.comparedSpecification).toBe(`${product.variants[1].storage} · ${product.variants[1].color} · ${product.variants[1].region} · ${product.variants[1].condition}`);
  });

  it("supports four products in a comparison", () => {
    const rows = buildCompareProducts(phones, [
      "apple-iphone-16-pro",
      "xiaomi-15",
      "oppo-find-x8",
      "vivo-x200",
    ]);

    expect(rows.map((row) => row.slug)).toEqual([
      "apple-iphone-16-pro",
      "xiaomi-15",
      "oppo-find-x8",
      "vivo-x200",
    ]);
  });

  it("ignores nonexistent product slugs", () => {
    expect(buildCompareProducts(phones, ["not-in-catalog", "xiaomi-15"]).map((row) => row.slug)).toEqual(["xiaomi-15"]);
  });

  it("returns fewer than two rows when fewer than two URL products exist", () => {
    expect(buildCompareProducts(phones, ["not-in-catalog", "xiaomi-15"])).toHaveLength(1);
  });

  it("computes deterministic best values without treating missing data as zero", () => {
    const unavailable = {
      ...phones[0],
      id: "unavailable",
      slug: "unavailable",
      variants: [{ ...phones[0].variants[0], offers: [] }],
    };
    const rows = buildCompareProducts([phones[0], phones[7], unavailable], [
      "apple-iphone-16-pro",
      "xiaomi-redmi-k80",
      "unavailable",
    ]);

    expect(getBestCompareValue(rows, "lowestPrice", "lowest")).toBe(2399);
    expect(getBestCompareValue(rows, "valueScore", "highest")).toBe(91);
    expect(getBestCompareValue(rows, "rating", "highest")).toBe(4.6);
    expect(getBestCompareValue(rows, "sales", "highest")).toBe(41000);
    expect(rows[2]).toMatchObject({ lowestPrice: null, valueScore: null, rating: null, sales: null });
  });
});
