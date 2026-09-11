import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  getProducts: vi.fn(),
  getLivePinduoduoOffers: vi.fn(),
  getLiveTaobaoOffers: vi.fn(),
}));

vi.mock("@/lib/catalog/repository", () => ({ getProducts: mocks.getProducts }));
vi.mock("@/lib/search/pinduoduo-live-service", () => ({ getLivePinduoduoOffers: mocks.getLivePinduoduoOffers }));
vi.mock("@/lib/search/taobao-live-service", () => ({ getLiveTaobaoOffers: mocks.getLiveTaobaoOffers }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => <header /> }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => <footer /> }));
vi.mock("@/components/compare/compare-selection", () => ({
  CompareBar: () => null,
  CompareToggleButton: () => null,
}));

import { phones } from "@/data/phones";
import type { LivePinduoduoOffer } from "@/lib/search/pinduoduo-live-offer";
import type { LiveTaobaoProductOffer } from "@/lib/search/taobao-live-offer";
import Page from "./page";

function liveOffer(): LivePinduoduoOffer {
  return {
    productId: phones[0].id,
    variantId: null,
    goodsId: "live-page-1",
    title: "页面实时商品",
    image: null,
    merchant: "页面商家",
    merchantType: null,
    hasCoupon: false,
    salesTip: null,
    realtimeSalesTip: null,
    sales: null,
    price: 6_999,
    source: "live",
    fetchedAt: "2026-09-05T00:00:00.000Z",
    relevance: 500,
  };
}

function liveTaobaoOffer(): LiveTaobaoProductOffer {
  return {
    productId: phones[0].id,
    variantId: null,
    itemId: "tb-page-1",
    title: "页面淘宝实时商品",
    image: null,
    merchant: "淘宝页面商家",
    salePrice: 6999,
    promotionPrice: null,
    promotionTags: [],
    productUrl: "https://s.click.taobao.com/page",
    source: "live",
  };
}

beforeEach(() => {
  mocks.events.length = 0;
  mocks.getProducts.mockReset().mockImplementation(async () => {
    mocks.events.push("catalog");
    return [phones[0]];
  });
  mocks.getLivePinduoduoOffers.mockReset().mockImplementation(async () => {
    mocks.events.push("live");
    return new Map([[phones[0].id, [liveOffer()]]]);
  });
  mocks.getLiveTaobaoOffers.mockReset().mockImplementation(async () => {
    mocks.events.push("taobao");
    return new Map([[phones[0].id, [liveTaobaoOffer()]]]);
  });
});

describe("search page live Pinduoduo integration", () => {
  it("loads the catalog before live offers and passes live results into the search rows", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ q: "iPhone 16" }) }));

    expect(mocks.events[0]).toBe("catalog");
    expect(new Set(mocks.events.slice(1))).toEqual(new Set(["live", "taobao"]));
    expect(mocks.getLivePinduoduoOffers).toHaveBeenCalledWith([phones[0]], "iPhone 16");
    expect(mocks.getLiveTaobaoOffers).toHaveBeenCalledWith([phones[0]]);
    expect(html).toContain("页面实时商品");
    expect(html).toContain("¥6,999");
    expect(html).toContain("页面淘宝实时商品");
    expect(html).toContain("实时平台报价");
    expect(html.indexOf("</article>")).toBeLessThan(html.indexOf("实时平台报价"));
  });

  it("keeps catalog and PDD results visible when the Taobao service fails", async () => {
    mocks.getLiveTaobaoOffers.mockRejectedValue(new Error("private Taobao failure"));

    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ q: "iPhone 16" }) }));

    expect(html).toContain(phones[0].name);
    expect(html).toContain("页面实时商品");
    expect(html).not.toContain("private Taobao failure");
  });

  it("skips the live lookup for an empty query and preserves the catalog fallback", async () => {
    mocks.getLivePinduoduoOffers.mockRejectedValue(new Error("must not be called"));
    mocks.getLiveTaobaoOffers.mockRejectedValue(new Error("must not be called"));

    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));

    expect(mocks.events).toEqual(["catalog"]);
    expect(mocks.getLivePinduoduoOffers).not.toHaveBeenCalled();
    expect(mocks.getLiveTaobaoOffers).not.toHaveBeenCalled();
    expect(html).toContain(phones[0].name);
    expect(html).not.toContain("实时拼多多报价");
  });

  it("keeps phone filters and live services for a recognized phone product", async () => {
    const xiaomi15 = phones.find((product) => product.slug === "xiaomi-15")!;
    mocks.getProducts.mockResolvedValue([xiaomi15]);

    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ q: "小米15" }) }));

    expect(html).toContain("手机");
    expect(html).toContain("小米");
    expect(mocks.getLivePinduoduoOffers).toHaveBeenCalledWith([xiaomi15], "小米15");
    expect(mocks.getLiveTaobaoOffers).toHaveBeenCalledWith([xiaomi15]);
  });

  it("uses a generic category state for clothing without phone facets or phone live services", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ q: "衣服" }) }));

    expect(html).toContain("服饰");
    expect(html).toContain("尚未建立完整的服饰商品目录和决策模型");
    expect(html).not.toContain("Apple");
    expect(html).not.toContain("手机</");
    expect(html).not.toContain("最低性价比分数");
    expect(mocks.getLivePinduoduoOffers).not.toHaveBeenCalled();
    expect(mocks.getLiveTaobaoOffers).not.toHaveBeenCalled();
  });

  it("treats an unknown explicit category as all without phone capabilities", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ q: "iPhone 16", category: "not-real" }) }));

    expect(html).toContain("全部商品");
    expect(html).not.toContain("Apple</label>");
    expect(html).not.toContain("最低性价比分数");
    expect(mocks.getLivePinduoduoOffers).not.toHaveBeenCalled();
    expect(mocks.getLiveTaobaoOffers).not.toHaveBeenCalled();
  });

});
