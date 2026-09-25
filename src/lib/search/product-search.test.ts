import { describe, expect, it } from "vitest";

import { phones } from "@/data/phones";
import type { Product } from "@/types/catalog";

import type { LivePinduoduoOffer } from "./pinduoduo-live-offer";
import type { LiveTaobaoProductOffer } from "./taobao-live-offer";
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

function liveOffer(productId: string, price: number, variantId: string | null = null): LivePinduoduoOffer {
  return {
    productId,
    variantId,
    productMatch: { status: "matched", evidenceSource: "title_only", productId },
    variantMatch: variantId
      ? { status: "matched", evidenceSource: "structured", variantId }
      : { status: "insufficient_evidence", evidenceSource: "none", variantId: null },
    goodsId: `live-${productId}`,
    title: "实时商品",
    image: null,
    merchant: "测试商家",
    merchantType: null,
    hasCoupon: false,
    salesTip: null,
    realtimeSalesTip: null,
    sales: null,
    price,
    source: "live",
    fetchedAt: "2026-09-05T00:00:00.000Z",
    relevance: 500,
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
      category: "phones",
    })).toEqual({
      query: "iPhone 16",
      brands: ["Apple", "Xiaomi"],
      minPrice: 5000,
      maxPrice: 10000,
      minScore: 70,
      sort: "price_asc",
      category: "phones",
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
      category: "not-a-real-category",
    })).toEqual({ brands: ["Apple"], category: "all", sort: "relevance" });
  });

  it("drops an invalid price range instead of throwing", () => {
    expect(parseProductSearchQuery({ minPrice: "10000", maxPrice: "5000" })).toEqual({ sort: "relevance" });
  });
});

describe("searchCatalog", () => {
  it.each([
    ["Xiaomi 15", "xiaomi-15"],
    ["小米 15", "xiaomi-15"],
    ["Xiaomi", "xiaomi-15"],
    ["苹果 iPhone 16 Pro", "apple-iphone-16-pro"],
    ["Huawei Mate 70 Pro", "huawei-mate-70-pro"],
    ["OPPO Find X8", "oppo-find-x8"],
    ["vivo X200", "vivo-x200"],
    ["iPhone 16 Pro", "apple-iphone-16-pro"],
  ])("matches controlled brand aliases in Product search: %s", (query, expectedSlug) => {
    expect(searchCatalog(phones, { query, sort: "relevance" }).map((row) => row.product.slug))
      .toContain(expectedSlug);
  });

  it.each([
    ["Xiaomi 15 Ultra", "xiaomi-15"],
    ["iPhone 16 Pro Max", "apple-iphone-16-pro"],
  ])("does not weaken explicit model boundaries in Product search: %s", (query, excludedSlug) => {
    expect(searchCatalog(phones, { query, sort: "relevance" }).map((row) => row.product.slug))
      .not.toContain(excludedSlug);
  });

  it("keeps Xiaomi and REDMI as separate consumer brand identities", () => {
    const xiaomiResults = searchCatalog(phones, { query: "Xiaomi", sort: "relevance" }).map((row) => row.product.slug);
    const redmiResults = searchCatalog(phones, { query: "Redmi", sort: "relevance" }).map((row) => row.product.slug);

    expect(xiaomiResults).toContain("xiaomi-15");
    expect(xiaomiResults).not.toContain("xiaomi-redmi-k80");
    expect(redmiResults).toContain("xiaomi-redmi-k80");
    expect(redmiResults).not.toContain("xiaomi-15");
  });

  it.each(["REDMI K80", "红米 K80"])("matches the REDMI product line without merging it into Xiaomi: %s", (query) => {
    expect(searchCatalog(phones, { query, sort: "relevance" }).map((row) => row.product.slug))
      .toContain("xiaomi-redmi-k80");
  });

  it("keeps Xiaomi and REDMI separate in brand filtering", () => {
    expect(searchCatalog(phones, { brands: ["小米"], sort: "relevance" }).map((row) => row.product.slug))
      .not.toContain("xiaomi-redmi-k80");
    expect(searchCatalog(phones, { brands: ["REDMI"], sort: "relevance" }).map((row) => row.product.slug))
      .toEqual(["xiaomi-redmi-k80"]);
  });

  it("keeps product-level Taobao listings out of price, sorting, filtering, and score metrics", () => {
    const product = structuredClone(phones.find((item) => item.slug === "xiaomi-15")!);
    const baseline = searchCatalog([product], { sort: "relevance" })[0];
    const taobao: LiveTaobaoProductOffer = {
      productId: product.id,
      variantId: null,
      itemId: "tb-cheap",
      title: "小米15 淘宝商品",
      image: null,
      merchant: "淘宝店铺",
      salePrice: 1,
      promotionPrice: 0.5,
      promotionTags: ["条件优惠"],
      productUrl: "https://s.click.taobao.com/example",
      source: "live",
    };

    const withTaobao = searchCatalog(
      [product],
      { minPrice: baseline.displayLowestPrice!, sort: "price_asc" },
      undefined,
      new Map([[product.id, [taobao]]]),
    )[0];

    expect(withTaobao.liveTaobaoOffers).toEqual([taobao]);
    expect(withTaobao.displayLowestPrice).toBe(baseline.displayLowestPrice);
    expect(withTaobao.lowestOffer).toEqual(baseline.lowestOffer);
    expect(withTaobao.valueScore).toBe(baseline.valueScore);
  });

  it("uses a lower live Pinduoduo price for display, price filtering, and price sorting only", () => {
    const liveProduct = structuredClone(phones[0]);
    const comparisonProduct = structuredClone(phones[1]);
    liveProduct.id = "live-price-product";
    comparisonProduct.id = "comparison-product";
    for (const offer of liveProduct.variants.flatMap((variant) => variant.offers)) offer.price = 8_000;
    for (const offer of comparisonProduct.variants.flatMap((variant) => variant.offers)) offer.price = 3_000;
    const baseline = searchCatalog([liveProduct], { sort: "relevance" })[0];
    const baselineVariant = liveProduct.variants.find((variant) => variant.offers.some((offer) => offer.id === baseline.lowestOffer?.id))!;
    const liveOffers = new Map([[liveProduct.id, [liveOffer(liveProduct.id, 2_000, baselineVariant.id)]]]);

    const sorted = searchCatalog([comparisonProduct, liveProduct], { sort: "price_asc" }, liveOffers);
    const filtered = searchCatalog([comparisonProduct, liveProduct], { maxPrice: 2_500, sort: "price_asc" }, liveOffers);
    const integrated = sorted[0];

    expect(sorted.map((row) => row.product.id)).toEqual([liveProduct.id, comparisonProduct.id]);
    expect(filtered.map((row) => row.product.id)).toEqual([liveProduct.id]);
    expect(integrated.displayLowestPrice).toBe(2_000);
    expect(integrated.livePinduoduoOffers).toEqual(liveOffers.get(liveProduct.id));
    expect(integrated.lowestOffer).toEqual(baseline.lowestOffer);
    expect(integrated.valueScore).toBe(baseline.valueScore);
    expect(integrated.rating).toBe(baseline.rating);
    expect(integrated.sales).toBe(baseline.sales);
    expect(integrated.platformCount).toBe(baseline.platformCount);
    expect(integrated.product.variants).toEqual(baseline.product.variants);
    expect(integrated).not.toHaveProperty("reviews");
  });

  it("does not use an unknown or different live SKU as the card headline price", () => {
    const product = structuredClone(phones.find((item) => item.slug === "apple-iphone-16-pro")!);
    const baseline = searchCatalog([product], { sort: "relevance" })[0];
    const unknownSku = liveOffer(product.id, 9.9, null);
    const differentSku = liveOffer(product.id, 99, "another-variant");

    const row = searchCatalog([product], { sort: "relevance" }, new Map([[product.id, [unknownSku, differentSku]]] ))[0];

    expect(row.livePinduoduoOffers).toEqual([unknownSku, differentSku]);
    expect(row.displayLowestPrice).toBe(baseline.lowestOffer?.price);
    expect(row.selectedVariantId).toBe(baseline.selectedVariantId);
  });

  it("does not let a non-null variantId bypass title-only evidence", () => {
    const product = structuredClone(phones.find((item) => item.slug === "apple-iphone-16-pro")!);
    const baseline = searchCatalog([product], { sort: "relevance" })[0];
    const titleOnly = {
      ...liveOffer(product.id, 1, baseline.selectedVariantId),
      variantMatch: { status: "insufficient_evidence", evidenceSource: "title_only", variantId: null } as const,
    };

    const row = searchCatalog([product], { maxPrice: 100, sort: "price_asc" }, new Map([[product.id, [titleOnly]]]));

    expect(row).toEqual([]);
    const result = searchCatalog([product], { sort: "relevance" }, new Map([[product.id, [titleOnly]]]))[0];
    expect(result.displayLowestPrice).toBe(baseline.displayLowestPrice);
    expect(result.valueScore).toBe(baseline.valueScore);
  });

  it("binds a comparable live minimum only to the explicitly selected catalog variant", () => {
    const product = structuredClone(phones.find((item) => item.slug === "apple-iphone-16-pro")!);
    const baseline = searchCatalog([product], { sort: "relevance" })[0];
    const selectedVariantId = baseline.selectedVariantId!;
    const otherVariantId = product.variants.find((variant) => variant.id !== selectedVariantId)!.id;
    const row = searchCatalog([product], { sort: "relevance" }, new Map([[product.id, [
      liveOffer(product.id, 1, null),
      liveOffer(product.id, 2, otherVariantId),
      liveOffer(product.id, 3, selectedVariantId),
    ]]]))[0];

    expect(row.selectedVariantId).toBe(selectedVariantId);
    expect(row.comparableLiveLowestPrice).toBe(3);
    expect(row.displayLowestPrice).toBe(3);
  });

  it("keeps the persisted catalog price fallback when no live data is supplied", () => {
    const row = searchCatalog([phones[0]], { sort: "relevance" })[0];

    expect(row.livePinduoduoOffers).toEqual([]);
    expect(row.displayLowestPrice).toBe(row.lowestOffer?.price);
  });

  it("matches the explicit base model regardless of case or extra spaces without including Pro", () => {
    const rows = searchCatalog(phones, { query: "  IPHONE   16 ", sort: "relevance" });

    expect(rows.map((row) => row.product.slug)).toEqual(["apple-iphone-16"]);
  });

  it("keeps explicit model suffixes and accessory searches out of unrelated catalog results", () => {
    expect(searchCatalog(phones, { query: "iPhone 16 Pro Max", sort: "relevance" })).toEqual([]);
    expect(searchCatalog(phones, { query: "小米15 Ultra", sort: "relevance" })).toEqual([]);
    expect(searchCatalog(phones, { query: "iPhone 16 Pro 手机壳", sort: "relevance" })).toEqual([]);
  });

  it("matches compact product names and variant/specification text", () => {
    expect(searchCatalog(phones, { query: "iphone16", sort: "relevance" }).map((row) => row.product.slug))
      .toContain("apple-iphone-16");
    expect(searchCatalog(phones, { query: "512gb", sort: "relevance" }).map((row) => row.product.slug))
      .toContain("apple-iphone-16-pro");
    expect(searchCatalog(phones, { query: "a18pro", sort: "relevance" }).map((row) => row.product.slug))
      .toContain("apple-iphone-16-pro");
  });

  it("matches an explicit model together with a known specification token", () => {
    expect(searchCatalog(phones, { query: "iPhone 16 Pro 512GB", sort: "relevance" }).map((row) => row.product.slug))
      .toEqual(["apple-iphone-16-pro"]);
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

    expect(rows.map((row) => row.product.slug)).toEqual(["xiaomi-15"]);
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
