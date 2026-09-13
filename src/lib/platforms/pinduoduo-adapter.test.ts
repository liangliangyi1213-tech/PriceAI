import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MockPlatformAdapter } from "./mock-platform-adapter";
import { PinduoduoAdapter, mapPinduoduoGoods } from "./pinduoduo-adapter";
import { phones } from "@/data/phones";

const goods = {
  goodsId: "123456789",
  goodsSign: "test_goods_sign",
  goodsName: "测试商品 500g 原味",
  goodsThumbnailUrl: "https://img.example.test/thumb.jpg",
  goodsImageUrl: "https://img.example.test/main.jpg",
  categoryName: "食品",
  mallName: "测试店铺",
  merchantType: 3,
  salesTip: "10万+",
  realtimeSalesTip: "12万+",
  hasCoupon: true,
  couponPrice: 85.99,
  couponMinOrderAmount: 99.99,
  minNormalPrice: 109.99,
  promotionRate: 250,
};

describe("PinduoduoAdapter", () => {
  it("does not invent a shop name when Pinduoduo omits mall_name", () => {
    expect(mapPinduoduoGoods({ ...goods, mallName: null }).shopName).toBe("");
  });
  it("maps keyword search independently from the recommendation pool", async () => {
    const client = {
      searchGoods: vi.fn().mockResolvedValue({ total: 1, goods: [goods] }),
      getRecommendedGoods: vi.fn(),
    };
    const adapter = new PinduoduoAdapter({ client });
    await expect(adapter.searchGoods("测试商品", { limit: 12, page: 2 })).resolves.toEqual([
      expect.objectContaining({ platform: "pdd", externalProductId: "123456789", price: 109.99, sales: 120000 }),
    ]);
    expect(client.searchGoods).toHaveBeenCalledWith("测试商品", { limit: 12, page: 2 });
    expect(client.getRecommendedGoods).not.toHaveBeenCalled();
  });

  it("rejects keyword search safely without configuration or on API failure", async () => {
    await expect(new PinduoduoAdapter({ client: null }).searchGoods("phone")).rejects.toMatchObject({ name: "PlatformAuthError" });
    const client = { getRecommendedGoods: vi.fn(), searchGoods: vi.fn().mockRejectedValue(new Error("private request")) };
    await expect(new PinduoduoAdapter({ client }).searchGoods("phone")).rejects.toMatchObject({ name: "PlatformRequestError" });
  });

  it("maps a recommended good into the existing platform result shape", () => {
    expect(mapPinduoduoGoods(goods)).toEqual({
      platform: "pdd",
      externalProductId: "123456789",
      externalVariantId: "test_goods_sign",
      title: "测试商品 500g 原味",
      price: 109.99,
      imageUrl: "https://img.example.test/main.jpg",
      shopName: "测试店铺",
      sales: 120000,
      productUrl: "",
      sourceMetadata: {
        categoryName: "食品",
        merchantType: 3,
        salesTip: "10万+",
        realtimeSalesTip: "12万+",
        hasCoupon: true,
        couponPrice: 85.99,
        couponMinOrderAmount: 99.99,
        minNormalPrice: 109.99,
        promotionRate: 250,
        thumbnailUrl: "https://img.example.test/thumb.jpg",
      },
    });
  });

  it("exposes recommendations as a product pool, not keyword search", async () => {
    const client = { getRecommendedGoods: vi.fn().mockResolvedValue({ total: 1, goods: [goods] }) };
    const adapter = new PinduoduoAdapter({ client, isDevelopment: false });

    await expect(adapter.getRecommendedProducts({ limit: 10, page: 2 })).resolves.toEqual([
      expect.objectContaining({ platform: "pdd", externalProductId: "123456789" }),
    ]);
    expect(client.getRecommendedGoods).toHaveBeenCalledWith({ limit: 10, offset: 10 });
    await expect(adapter.searchProducts("手机")).rejects.toMatchObject({ name: "PlatformUnavailableError" });
  });

  it("uses the development fallback when Pinduoduo is not configured", async () => {
    const fallback = { ...new MockPlatformAdapter([]), getRecommendedProducts: vi.fn().mockResolvedValue([{ platform: "pdd" }]) };
    const adapter = new PinduoduoAdapter({ client: null, fallback, isDevelopment: true });

    await expect(adapter.getRecommendedProducts()).resolves.toEqual([{ platform: "pdd" }]);
  });

  it("fails safely in production when Pinduoduo is not configured", async () => {
    const adapter = new PinduoduoAdapter({ client: null, isDevelopment: false });

    await expect(adapter.getRecommendedProducts()).rejects.toMatchObject({
      name: "PlatformAuthError",
      platform: "pdd",
    });
  });

  it("discovers strict whole-phone image candidates without claiming a title-derived Variant", async () => {
    const product = phones.find((item) => item.slug === "xiaomi-15")!;
    const listing = {
      ...goods,
      goodsId: "pdd-xiaomi-15",
      goodsName: "小米15 12GB 256GB 黑色 国行手机",
      goodsImageUrl: "https://img.pddpic.com/xiaomi-15.jpg",
      goodsThumbnailUrl: "https://img.pddpic.com/xiaomi-15-thumb.jpg",
      fetchedAt: new Date("2026-09-13T00:00:00.000Z"),
    };
    const client = {
      searchGoods: vi.fn().mockResolvedValue({ total: 1, goods: [listing] }),
      getRecommendedGoods: vi.fn(),
    };
    const adapter = new PinduoduoAdapter({ client });

    const results = await adapter.searchPhoneImageCandidatesForProduct(product, { limit: 3 });

    expect(results).toEqual([{ listing, product }]);
    expect(results[0]).not.toHaveProperty("variant");
    expect(client.searchGoods).toHaveBeenCalledWith(product.name, { limit: 20, page: 1 });
  });

  it("does not return accessories or conflicting phone models as image candidates", async () => {
    const product = phones.find((item) => item.slug === "apple-iphone-16-pro")!;
    const listings = [
      { ...goods, goodsId: "case", goodsName: "iPhone 16 Pro 手机壳", fetchedAt: new Date() },
      { ...goods, goodsId: "max", goodsName: "Apple iPhone 16 Pro Max 全新手机", fetchedAt: new Date() },
    ];
    const client = {
      searchGoods: vi.fn().mockResolvedValue({ total: 2, goods: listings }),
      getRecommendedGoods: vi.fn(),
    };

    await expect(new PinduoduoAdapter({ client })
      .searchPhoneImageCandidatesForProduct(product, { limit: 3 }))
      .resolves.toEqual([]);
  });
});
