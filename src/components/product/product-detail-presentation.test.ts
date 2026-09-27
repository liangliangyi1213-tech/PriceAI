import { describe, expect, it } from "vitest";
import { phones } from "@/data/phones";
import { getDetailOffers, getDetailPurchaseReference } from "./product-detail-presentation";

describe("product detail offer presentation", () => {
  it("sorts valid offers without changing the source order", () => {
    const variant = structuredClone(phones[0].variants[0]);
    variant.offers.push({ ...variant.offers[0], id: "invalid", price: 0 });
    const sourceIds = variant.offers.map((offer) => offer.id);
    expect(getDetailOffers(variant.offers).map((offer) => offer.price)).toEqual([7599, 7799, 7999]);
    expect(variant.offers.map((offer) => offer.id)).toEqual(sourceIds);
  });

  it("compares the two lowest distinct platforms for an honest purchase reference", () => {
    expect(getDetailPurchaseReference(phones[0].variants[0])).toBe("同规格最低报价比第二低报价低 ¥200，可以优先比较。");
  });

  it("does not let an unknown cheapest offer drive the purchase reference", () => {
    const variant = structuredClone(phones[0].variants[0]);
    variant.offers.push({
      ...variant.offers[0],
      id: "unknown-cheapest",
      platform: "来源待确认",
      price: 1,
      source: "unrecognized-source",
    });

    expect(getDetailOffers(variant.offers).map((offer) => offer.id)).toContain("unknown-cheapest");
    expect(getDetailPurchaseReference(variant)).toBe("同规格最低报价比第二低报价低 ¥200，可以优先比较。");
  });

  it("does not invent a second-price comparison when only one offer is comparable", () => {
    const variant = structuredClone(phones[0].variants[0]);
    variant.offers = [
      variant.offers[0],
      { ...variant.offers[1], source: "unrecognized-source", price: 1 },
    ];

    expect(getDetailPurchaseReference(variant)).toBe("当前仅有 1 个已收录可比报价，无法计算与第二低价的差额。");
  });

  it("handles missing, single-platform, and tied platform prices", () => {
    const base = structuredClone(phones[0].variants[0]);
    expect(getDetailPurchaseReference({ ...base, offers: [] })).toBe("当前没有足够的已收录可比报价，暂不作购买判断。");
    expect(getDetailPurchaseReference({ ...base, offers: [base.offers[0]] })).toBe("当前仅有 1 个已收录可比报价，无法计算与第二低价的差额。");
    expect(getDetailPurchaseReference({ ...base, offers: base.offers.map((offer) => ({ ...offer, price: 100 })) })).toBe("多个平台同为最低报价，建议核对服务与购买条件。");
  });
});
