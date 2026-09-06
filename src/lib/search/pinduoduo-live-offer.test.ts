import { describe, expect, it } from "vitest";
import { phones } from "@/data/phones";
import type { PinduoduoGoods } from "@/lib/platforms/pinduoduo-client";
import { selectComparablePinduoduoPrice, selectLivePinduoduoOffers } from "./pinduoduo-live-offer";
import { searchCatalog } from "./products";

const product = phones.find((item) => item.slug === "apple-iphone-16")!;
const goods = (overrides: Partial<PinduoduoGoods> = {}): PinduoduoGoods => ({
  goodsId: "123", goodsSign: null, goodsName: "Apple iPhone16 256GB 黑色 手机",
  goodsThumbnailUrl: "https://example.com/thumb.jpg", goodsImageUrl: "https://example.com/phone.jpg",
  categoryName: "手机", mallName: "品牌商城", merchantType: 1, salesTip: "1.2万+", realtimeSalesTip: null,
  hasCoupon: false, couponPrice: null, couponMinOrderAmount: null, minNormalPrice: 5000,
  promotionRate: 20, fetchedAt: new Date("2026-09-05T00:00:00Z"), ...overrides,
});

describe("comparable Pinduoduo prices", () => {
  it("chooses the lowest valid normal/group price", () => {
    expect(selectComparablePinduoduoPrice(goods({ minGroupPrice: 4800 }))).toEqual({ price: 4800, normalPrice: 5000, groupPrice: 4800 });
    expect(selectComparablePinduoduoPrice(goods({ minGroupPrice: 5500 }))).toEqual({ price: 5000, normalPrice: 5000, groupPrice: 5500 });
    expect(selectComparablePinduoduoPrice(goods({ minNormalPrice: 0, minGroupPrice: 4500 }))).toEqual({ price: 4500, groupPrice: 4500 });
  });
  it.each([0, -1, NaN, Infinity])("rejects invalid prices %s", (price) => {
    expect(selectComparablePinduoduoPrice(goods({ minNormalPrice: price, minGroupPrice: price }))).toBeNull();
  });
  it.each([0, 4000, 5000, 6000, null])("does not treat unconfirmed coupon_price as payable even with threshold %s", (threshold) => {
    // Raw PinduoduoGoods supplies no confirmed-payable semantics. A satisfied threshold is insufficient.
    expect(selectComparablePinduoduoPrice(goods({ hasCoupon: true, couponPrice: 100, couponMinOrderAmount: threshold }))).toEqual({ price: 5000, normalPrice: 5000 });
  });
  it("never prices an item using an extra coupon amount alone", () => {
    expect(selectComparablePinduoduoPrice(goods({ minNormalPrice: 0, extraCouponAmount: 30, couponPrice: 100, hasCoupon: true }))).toBeNull();
  });
});

describe("live Pinduoduo offers", () => {
  it.each([
    "Apple iPhone16 Pro 钢化膜 手机贴膜",
    "Apple iPhone16 Pro 手机模型 展示机",
  ])("keeps non-phone listing out of headline, price filtering, and sorting: %s", (title) => {
    const pro = phones[0];
    const live = selectLivePinduoduoOffers([pro], "iphone16pro", [goods({ goodsName: title, categoryName: null, minNormalPrice: 9.9 })]);
    expect(live.size).toBe(0);
    expect(searchCatalog([pro], { sort: "relevance" }, live)[0].displayLowestPrice).toBe(7599);
    expect(searchCatalog([pro], { sort: "price_asc", maxPrice: 100 }, live)).toEqual([]);
    expect(searchCatalog([pro, product], { sort: "price_asc" }, live).map((row) => row.product.id)).toEqual([product.id, pro.id]);
  });
  it("still lets a genuine phone offer set the product-level live minimum", () => {
    const pro = phones[0];
    const live = selectLivePinduoduoOffers([pro], "iphone16pro", [goods({ goodsName: "Apple iPhone16 Pro 256GB 黑色 全新手机 OLED display", categoryName: null, minNormalPrice: 7000 })]);
    expect(searchCatalog([pro], { sort: "relevance" }, live)[0].displayLowestPrice).toBe(7000);
    expect(live.get(pro.id)).toHaveLength(1);
  });
  it("never lets replacement parts or another model lower the live phone price", () => {
    const selected = selectLivePinduoduoOffers([product], "iphone16", [
      goods(),
      goods({ goodsId: "battery", goodsName: "Apple iPhone16 电池", categoryName: null, optName: "电池", minNormalPrice: 80 }),
      goods({ goodsId: "screen", goodsName: "Apple iPhone16 替换屏幕总成", categoryName: null, minNormalPrice: 200 }),
      goods({ goodsId: "16e", goodsName: "Apple iPhone16e 全新手机", minNormalPrice: 3000 }),
    ]).get(product.id)!;
    expect(selected.map((offer) => offer.goodsId)).toEqual(["123"]);
    expect(Math.min(...selected.map((offer) => offer.price))).toBe(5000);
  });
  it.each([
    "Apple iPhone16 256GB 蓝色 全新手机",
    "Apple iPhone16 256GB 黑色 港版全新手机",
    "Apple iPhone16 256GB 黑色 二手手机",
    "Apple iPhone16 256GB 黑色 官翻手机",
    "Apple iPhone16 256GB 黑色/蓝色 全新手机",
    "Apple iPhone16 256GB 黑色 国行/港版 全新手机",
    "Apple iPhone16 256GB 午夜色 全新手机",
    "Apple iPhone16 256GB 黑色 欧版 全新手机",
  ])("leaves conflicting or unreconciled variant attributes unknown: %s", (title) => {
    const [offer] = selectLivePinduoduoOffers([product], "iphone16", [goods({ goodsName: title })]).get(product.id)!;
    expect(offer.variantId).toBeNull();
  });
  it("assigns the variant when all explicit attributes agree", () => {
    const [offer] = selectLivePinduoduoOffers([product], "iphone16", [goods({ goodsName: "Apple iPhone16 256GB 黑色 国行 全新手机" })]).get(product.id)!;
    expect(offer.variantId).toBe(product.variants[0].id);
  });
  it("maps honest metadata and a matching variant without mutating the catalog", () => {
    const before = structuredClone(product);
    const [offer] = selectLivePinduoduoOffers([product], "iphone16", [goods({ hasCoupon: true, couponPrice: 100, couponMinOrderAmount: 1000, extraCouponAmount: 20 })]).get(product.id)!;
    expect(offer).toMatchObject({ productId: product.id, variantId: product.variants[0].id, goodsId: "123", title: "Apple iPhone16 256GB 黑色 手机", image: "https://example.com/phone.jpg", merchant: "品牌商城", price: 5000, normalPrice: 5000, source: "live", fetchedAt: "2026-09-05T00:00:00.000Z", salesTip: "1.2万+", sales: 12000, promotionRate: 20, hasCoupon: true, couponAmount: 100, couponMinOrderAmount: 1000, extraCouponAmount: 20 });
    expect(offer).not.toHaveProperty("rating");
    expect(offer).not.toHaveProperty("reviewCount");
    expect(offer).not.toHaveProperty("url");
    expect(offer).not.toHaveProperty("couponPrice");
    expect(product).toEqual(before);
  });
  it("keeps the variant unknown when no supplied storage/color establishes a match", () => {
    const [offer] = selectLivePinduoduoOffers([product], "iphone16", [goods({ goodsName: "Apple iPhone16 手机" })]).get(product.id)!;
    expect(offer.variantId).toBeNull();
  });
  it("does not assign a variant with conflicting storage or condition", () => {
    const [offer] = selectLivePinduoduoOffers([product], "iphone16", [goods({ goodsName: "Apple iPhone16 128GB 二手 手机" })]).get(product.id)!;
    expect(offer.variantId).toBeNull();
  });
  it("excludes accessories, unrelated goods, and unpriced goods", () => {
    expect(selectLivePinduoduoOffers([product], "iphone16", [goods({ goodsName: "iPhone16 手机壳" }), goods({ goodsName: "iPhone15 手机" }), goods({ minNormalPrice: 0 })]).size).toBe(0);
  });
  it("sorts by relevance, then price, sales, goodsId and deduplicates before Top 5", () => {
    const input = [
      goods({ goodsId: "z", minNormalPrice: 4000, salesTip: "10" }),
      goods({ goodsId: "b", minNormalPrice: 4000, salesTip: "100" }),
      goods({ goodsId: "a", minNormalPrice: 4000, salesTip: "100" }),
      goods({ goodsId: "c", minNormalPrice: 3999, salesTip: "1" }),
      goods({ goodsId: "low-relevance", goodsName: "iPhone16 手机", minNormalPrice: 100 }),
      goods({ goodsId: "d", minNormalPrice: 4100 }),
      goods({ goodsId: "a", minNormalPrice: 4500 }),
      goods({ goodsId: "e", minNormalPrice: 4200 }),
    ];
    const selected = selectLivePinduoduoOffers([product], "iphone16", input).get(product.id)!;
    expect(selected.map((offer) => offer.goodsId)).toEqual(["c", "a", "b", "z", "d"]);
    expect(selectLivePinduoduoOffers([product], "iphone16", [...input].reverse()).get(product.id)!.map((offer) => offer.goodsId)).toEqual(["c", "a", "b", "z", "d"]);
  });
  it("limits each product independently", () => {
    const input = Array.from({ length: 8 }, (_, index) => goods({ goodsId: String(index) }));
    input.push(...Array.from({ length: 8 }, (_, index) => goods({ goodsId: `pro-${index}`, goodsName: "Apple iPhone16 Pro 手机" })));
    const selected = selectLivePinduoduoOffers([product, phones[0]], "iphone16", input);
    expect(selected.get(product.id)).toHaveLength(5);
    expect(selected.get(phones[0].id)).toHaveLength(5);
    expect(selectLivePinduoduoOffers([product], "iphone16", input, 2).get(product.id)).toHaveLength(2);
    expect(selectLivePinduoduoOffers([product], "iphone16", input, 0).size).toBe(0);
  });
  it("preserves missing sales and omits invalid optional numeric metadata", () => {
    const [offer] = selectLivePinduoduoOffers([product], "iphone16", [goods({ salesTip: "热销", realtimeSalesTip: null, couponPrice: -1, extraCouponAmount: NaN, couponMinOrderAmount: -1, promotionRate: Infinity })]).get(product.id)!;
    expect(offer.sales).toBeNull();
    expect(offer).not.toHaveProperty("couponAmount");
    expect(offer).not.toHaveProperty("extraCouponAmount");
    expect(offer).not.toHaveProperty("couponMinOrderAmount");
    expect(offer).not.toHaveProperty("promotionRate");
  });
});
