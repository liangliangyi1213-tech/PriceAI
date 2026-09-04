import { describe, expect, it } from "vitest";

import { phones } from "@/data/phones";

import { MockPlatformAdapter } from "./mock-platform-adapter";

describe("MockPlatformAdapter", () => {
  it("normalizes matching mock offers into platform search results", async () => {
    const adapter = new MockPlatformAdapter(phones);

    const results = await adapter.searchProducts("iPhone 16 Pro");

    expect(results).toHaveLength(6);
    expect(results[0]).toMatchObject({
      platform: "jd",
      externalProductId: "apple-iphone-16-pro",
      externalVariantId: "apple-iphone-16-pro-256GB-黑色",
      title: "京东 apple-iphone-16-pro-256GB-黑色 官方正品",
      price: 7999,
      originalPrice: 8299,
      imageUrl: "/phone-placeholder.svg",
      shopName: "品牌旗舰店",
      sales: 12000,
      rating: 4.8,
      productUrl: "https://mock.priceai.local/offers/apple-iphone-16-pro-256GB-%E9%BB%91%E8%89%B2%E4%BA%AC%E4%B8%9C",
    });
  });

  it("returns no result for an empty search query", async () => {
    const adapter = new MockPlatformAdapter(phones);

    await expect(adapter.searchProducts("   ")).resolves.toEqual([]);
  });

  it("applies price and pagination options without changing normalized data", async () => {
    const adapter = new MockPlatformAdapter(phones);

    const results = await adapter.searchProducts("iPhone", {
      minPrice: 7599,
      maxPrice: 8000,
      sort: "price_asc",
      limit: 1,
      page: 2,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ platform: "taobao", price: 7799 });
  });
});
