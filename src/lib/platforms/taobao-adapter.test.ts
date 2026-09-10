import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TaobaoAdapter, mapTaobaoLiveOffer } from "./taobao-adapter";
import type { LiveTaobaoOffer } from "./taobao-client";
import { phones } from "@/data/phones";

const liveOffer: LiveTaobaoOffer = {
  itemId: "123456", title: "Apple iPhone 16 Pro", shortTitle: "iPhone 16 Pro", brandName: "Apple",
  categoryId: "1512", categoryName: "手机", shopTitle: "Apple 授权店", sellerId: "seller-1",
  pictUrl: "https://img.example.test/iphone.jpg", smallImages: [], reservePrice: 8999, salePrice: 7999,
  promotionPrice: 7499, promotionTagList: ["地区补贴"], govSubsidy: { tagName: "国家补贴", stateSubsidyInfo: null }, annualVol: 12000, totalSales: 12500,
  clickUrl: "https://s.click.taobao.com/test",
  variantId: null,
};

describe("TaobaoAdapter", () => {
  it("uses salePrice as the comparable adapter price and retains conditional promotion price only as metadata", () => {
    const mapped = mapTaobaoLiveOffer(liveOffer);

    expect(mapped).toMatchObject({
      platform: "taobao", externalProductId: "123456", title: "Apple iPhone 16 Pro", price: 7999,
      originalPrice: 8999, shopName: "Apple 授权店", sales: 12500, productUrl: "https://s.click.taobao.com/test",
    });
    expect(mapped.externalVariantId).toBeUndefined();
    expect(mapped.sourceMetadata).toMatchObject({ reservePrice: 8999, salePrice: 7999, promotionPrice: 7499, govSubsidyTag: "国家补贴" });
  });

  it("does not fabricate SKU variants while searching a product-specific phone query", async () => {
    const searchPhoneGoods = vi.fn().mockResolvedValue({ items: [liveOffer] });
    const adapter = new TaobaoAdapter({
      client: { searchPhoneGoods },
    });

    const results = await adapter.searchPhoneOffersForProduct(phones.find((product) => product.slug === "xiaomi-15")!, { minPrice: 2500 });

    expect(results).toHaveLength(1);
    expect(results[0].offer.variantId).toBeNull();
    expect(searchPhoneGoods).toHaveBeenCalledWith("小米15 手机", expect.objectContaining({ startPrice: 2500 }));
  });

  it("converts upstream failures into a safe platform error", async () => {
    const adapter = new TaobaoAdapter({
      client: { searchPhoneGoods: vi.fn().mockRejectedValue(new Error("Authorization: private-token")) },
    });

    await expect(adapter.searchProducts("iPhone 16 Pro")).rejects.toMatchObject({
      name: "PlatformRequestError",
      message: "淘宝平台请求失败，请稍后重试。",
    });
  });
});
