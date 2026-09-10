import { describe, expect, it } from "vitest";

import { phones } from "@/data/phones";

import { matchTaobaoPhoneOffer } from "./taobao-matching";
import type { LiveTaobaoOffer } from "./taobao-client";

function liveOffer(title: string, brandName = "Apple"): LiveTaobaoOffer {
  return {
    itemId: "test-item", title, shortTitle: null, brandName, categoryId: "1512", categoryName: "手机",
    shopTitle: "测试店铺", sellerId: "seller", pictUrl: null, smallImages: [], reservePrice: null,
    salePrice: 7999, promotionPrice: null, promotionTagList: [], govSubsidy: null, annualVol: null,
    totalSales: null, clickUrl: null,
    variantId: null,
  };
}

const iphone16Pro = phones.find((product) => product.slug === "apple-iphone-16-pro")!;
const xiaomi15 = phones.find((product) => product.slug === "xiaomi-15")!;

describe("strict Taobao phone product matching", () => {
  it("rejects phone accessories before considering a product match", () => {
    expect(matchTaobaoPhoneOffer(liveOffer("iPhone 16 Pro 手机壳 全包保护壳"), iphone16Pro)).toMatchObject({ status: "rejected" });
  });

  it("does not treat iPhone 16 Pro Max as iPhone 16 Pro", () => {
    expect(matchTaobaoPhoneOffer(liveOffer("Apple iPhone 16 Pro Max 国行"), iphone16Pro)).toMatchObject({ status: "unmatched" });
  });

  it("marks a title containing multiple iPhone models as ambiguous", () => {
    expect(matchTaobaoPhoneOffer(liveOffer("Apple iPhone 16 Pro / iPhone 16 Pro Max 国行"), iphone16Pro)).toMatchObject({ status: "ambiguous" });
  });

  it("allows an exact Xiaomi 15 title without conflicting Pro or Ultra suffixes", () => {
    expect(matchTaobaoPhoneOffer(liveOffer("小米15 全新国行手机", "小米"), xiaomi15)).toMatchObject({ status: "matched", product: xiaomi15 });
  });

  it("does not treat Xiaomi 15 Ultra as Xiaomi 15", () => {
    expect(matchTaobaoPhoneOffer(liveOffer("小米 15 Ultra 全新手机", "小米"), xiaomi15)).toMatchObject({ status: "unmatched" });
  });
});
