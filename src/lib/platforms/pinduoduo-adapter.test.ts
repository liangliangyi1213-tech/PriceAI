import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MockPlatformAdapter } from "./mock-platform-adapter";
import { PinduoduoAdapter, mapPinduoduoGoods } from "./pinduoduo-adapter";

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
});
