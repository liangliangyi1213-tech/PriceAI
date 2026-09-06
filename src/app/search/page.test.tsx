import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  getProducts: vi.fn(),
  getLivePinduoduoOffers: vi.fn(),
}));

vi.mock("@/lib/catalog/repository", () => ({ getProducts: mocks.getProducts }));
vi.mock("@/lib/search/pinduoduo-live-service", () => ({ getLivePinduoduoOffers: mocks.getLivePinduoduoOffers }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => <header /> }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => <footer /> }));
vi.mock("@/components/compare/compare-selection", () => ({
  CompareBar: () => null,
  CompareToggleButton: () => null,
}));

import { phones } from "@/data/phones";
import type { LivePinduoduoOffer } from "@/lib/search/pinduoduo-live-offer";
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
});

describe("search page live Pinduoduo integration", () => {
  it("loads the catalog before live offers and passes live results into the search rows", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ q: "iPhone 16" }) }));

    expect(mocks.events).toEqual(["catalog", "live"]);
    expect(mocks.getLivePinduoduoOffers).toHaveBeenCalledWith([phones[0]], "iPhone 16");
    expect(html).toContain("页面实时商品");
    expect(html).toContain("¥6,999");
  });

  it("skips the live lookup for an empty query and preserves the catalog fallback", async () => {
    mocks.getLivePinduoduoOffers.mockRejectedValue(new Error("must not be called"));

    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));

    expect(mocks.events).toEqual(["catalog"]);
    expect(mocks.getLivePinduoduoOffers).not.toHaveBeenCalled();
    expect(html).toContain(phones[0].name);
    expect(html).not.toContain("实时拼多多报价");
  });
});
