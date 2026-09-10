import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { phones } from "@/data/phones";
import { TaobaoAdapter } from "@/lib/platforms/taobao-adapter";
import type { LiveTaobaoOffer } from "@/lib/platforms/taobao-client";
import type { Product } from "@/types/catalog";

import { createLiveTaobaoService } from "./taobao-live-service";

function product(slug: string): Product {
  return phones.find((item) => item.slug === slug)!;
}

function offer(title: string, overrides: Partial<LiveTaobaoOffer> = {}): LiveTaobaoOffer {
  return {
    itemId: "tb-live-1",
    title,
    shortTitle: null,
    brandName: "小米",
    categoryId: "1512",
    categoryName: "手机",
    shopTitle: "小米授权店",
    sellerId: "seller-1",
    pictUrl: "https://img.example.test/xiaomi-15.jpg",
    smallImages: [],
    reservePrice: 4999,
    salePrice: 4299,
    promotionPrice: 3999,
    promotionTagList: ["官方立减", "地区补贴"],
    govSubsidy: null,
    annualVol: 1000,
    totalSales: 1200,
    clickUrl: "https://s.click.taobao.com/example",
    variantId: null,
    ...overrides,
  };
}

function adapterWith(items: LiveTaobaoOffer[]) {
  return new TaobaoAdapter({
    client: { searchPhoneGoods: async () => ({ items, rawCount: items.length }) },
  });
}

describe("live Taobao product offers", () => {
  it("publishes a strictly matched Xiaomi 15 listing without inventing a variant", async () => {
    const target = product("xiaomi-15");
    const service = createLiveTaobaoService({ adapter: adapterWith([offer("Xiaomi 小米15 全新手机")]) });

    const result = await service([target]);

    expect(result.get(target.id)).toEqual([expect.objectContaining({
      productId: target.id,
      itemId: "tb-live-1",
      salePrice: 4299,
      promotionPrice: 3999,
      variantId: null,
    })]);
  });

  it("does not publish iPhone 16 Pro Max for iPhone 16 Pro", async () => {
    const target = product("apple-iphone-16-pro");
    const source = offer("Apple iPhone 16 Pro Max 国行全新手机", { brandName: "Apple" });
    const service = createLiveTaobaoService({ adapter: adapterWith([source]) });

    expect((await service([target])).get(target.id)).toBeUndefined();
  });

  it("does not publish mixed-model ambiguous listings", async () => {
    const target = product("apple-iphone-16-pro");
    const source = offer("Apple iPhone 16 Pro / iPhone 16 Pro Max 多型号可选", { brandName: "Apple" });
    const service = createLiveTaobaoService({ adapter: adapterWith([source]) });

    expect((await service([target])).get(target.id)).toBeUndefined();
  });

  it("returns an empty result when Taobao fails", async () => {
    const service = createLiveTaobaoService({
      adapter: { searchPhoneOffersForProduct: async () => { throw new Error("private provider failure"); } },
    });

    expect(await service([product("xiaomi-15")])).toEqual(new Map());
  });

  it("returns an empty result when Taobao exceeds the request deadline", async () => {
    const service = createLiveTaobaoService({
      adapter: { searchPhoneOffersForProduct: () => new Promise(() => undefined) },
      timeoutMs: 5,
    });

    expect(await service([product("xiaomi-15")])).toEqual(new Map());
  });
});
