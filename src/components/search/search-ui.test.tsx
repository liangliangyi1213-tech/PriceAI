import { renderToStaticMarkup } from "react-dom/server";
import { Fragment } from "react";
import { describe, expect, it } from "vitest";
import { phones } from "@/data/phones";
import type { LivePinduoduoOffer } from "@/lib/search/pinduoduo-live-offer";
import { searchCatalog } from "@/lib/search/products";
import { SearchFilters } from "./search-filters";

function liveOffer(overrides: Partial<LivePinduoduoOffer> = {}): LivePinduoduoOffer {
  return {
    productId: phones[0].id,
    variantId: phones[0].variants[0].id,
    goodsId: "live-1",
    title: "Apple iPhone 16 实时商品标题",
    image: "https://example.com/live-phone.jpg",
    merchant: "品牌好店",
    merchantType: 1,
    hasCoupon: true,
    couponAmount: 200,
    couponMinOrderAmount: 1_000,
    extraCouponAmount: 50,
    salesTip: "已拼1.2万+",
    realtimeSalesTip: "近2小时已拼100+件",
    sales: 12_000,
    price: 6_999,
    source: "live",
    fetchedAt: "2026-09-05T00:00:00.000Z",
    relevance: 500,
    ...overrides,
  };
}

describe("search filter navigation", () => {
  it("prefills the top search and preserves comparison on a new search", async () => {
    const { ResultsSearch } = await import("./results-search");
    const html = renderToStaticMarkup(<ResultsSearch query="茶杯" compareSlugs={["a", "b"]} />);
    expect(html).toContain('name="q" value="茶杯"');
    expect(html).toContain('name="compare" value="a"');
    expect(html).toContain('name="compare" value="b"');
    expect(html).toContain('action="/search"');
    expect(html).toContain('placeholder="搜索你想买的商品"');
  });
  it("renders removable filters and sorting links that retain the current selection", async () => {
    const { ResultsToolbar } = await import("./results-toolbar");
    const html = renderToStaticMarkup(<ResultsToolbar count={3} query={{ query: "杯", brands: ["A"], minPrice: 100, sort: "relevance" }} compareSlugs={["a"]} />);
    expect(html).toContain("brand=A&amp;minPrice=100&amp;sort=price_asc&amp;compare=a");
    expect(html).toContain('aria-label="移除品牌 A"');
    expect(html).toContain('aria-current="true"');
  });
  it("clearing filters does not discard the search keyword or selected comparisons", () => {
    const html = renderToStaticMarkup(<SearchFilters brands={["Apple"]} compareSlugs={["a"]} searchQuery={{ query: "杯", brands: ["Apple"], sort: "price_asc" }} />);
    expect(html).toContain('href="/search?q=%E6%9D%AF&amp;sort=relevance&amp;compare=a"');
  });
});

describe("product card presentation", () => {
  it("shows restrained live Pinduoduo facts and the lower comparable display price", async () => {
    const { SearchProductCard } = await import("./search-product-card");
    const offer = liveOffer();
    const row = searchCatalog([phones[0]], { sort: "relevance" }, new Map([[phones[0].id, [offer]]] ))[0];
    const html = renderToStaticMarkup(<SearchProductCard row={row} />);

    expect(html).toContain("实时拼多多报价");
    expect(html).toContain("实时拼多多报价暂未计入 PriceAI 评分");
    expect(html).toContain("Apple iPhone 16 实时商品标题");
    expect(html).toContain("品牌好店");
    expect(html).toContain("¥6,999");
    expect(html).toContain("近2小时已拼100+件");
    expect(html).toContain("券额 ¥200");
    expect(html).toContain("使用门槛 ¥1,000");
    expect(html).toContain("额外优惠 ¥50");
    expect(html).toContain("https://example.com/live-phone.jpg");
    expect(html).not.toMatch(/评分：4\.\d|评论|评价|去购买|立即购买/);
  });

  it("visibly scopes the persisted purchase reference when a lower live price leads", async () => {
    const { SearchProductCard } = await import("./search-product-card");
    const offer = liveOffer({ price: 6_999 });
    const row = searchCatalog([phones[0]], { sort: "relevance" }, new Map([[phones[0].id, [offer]]]))[0];
    const html = renderToStaticMarkup(<SearchProductCard row={row} />);

    expect(html).toContain("当前可比最低价");
    expect(html).toContain("¥6,999");
    expect(html).toContain("已收录平台报价中，同规格最低报价比第二低报价低 ¥200");
    expect(html).not.toContain("参与评分的平台报价");
    expect(html).toContain("此参考不含实时拼多多报价");
  });

  it("omits absent live facts and the entire section when no live data exists", async () => {
    const { SearchProductCard } = await import("./search-product-card");
    const absentFacts = liveOffer({
      image: "javascript:alert(1)",
      merchant: "",
      hasCoupon: false,
      couponAmount: undefined,
      couponMinOrderAmount: undefined,
      extraCouponAmount: undefined,
      salesTip: null,
      realtimeSalesTip: null,
      sales: null,
    });
    const withLive = renderToStaticMarkup(<SearchProductCard row={searchCatalog(
      [phones[0]],
      { sort: "relevance" },
      new Map([[phones[0].id, [absentFacts]]]),
    )[0]} />);
    const withoutLive = renderToStaticMarkup(<SearchProductCard row={searchCatalog([phones[0]], { sort: "relevance" })[0]} />);

    expect(withLive).not.toContain("javascript:alert(1)");
    expect(withLive).not.toMatch(/优惠信息|销量|品牌好店/);
    expect(withoutLive).not.toContain("实时拼多多报价");
    expect(withoutLive).toContain("当前已收录最低价");
  });

  it("keeps an unknown live SKU separate from the persisted headline price", async () => {
    const { SearchProductCard } = await import("./search-product-card");
    const offer = liveOffer({ variantId: null, price: 9.9 });
    const html = renderToStaticMarkup(<SearchProductCard row={searchCatalog(
      [phones[0]],
      { sort: "relevance" },
      new Map([[phones[0].id, [offer]]]),
    )[0]} />);

    expect(html).toContain("¥7,599");
    expect(html).toContain("当前已收录最低价");
    expect(html).toContain("¥9.9");
    expect(html).not.toContain("当前可比最低价");
  });

  it("keeps live section identifiers unique when multiple cards render", async () => {
    const { SearchProductCard } = await import("./search-product-card");
    const first = structuredClone(phones[0]);
    const second = structuredClone(phones[1]);
    const offers = new Map([
      [first.id, [liveOffer({ productId: first.id, goodsId: "first" })]],
      [second.id, [liveOffer({ productId: second.id, goodsId: "second" })]],
    ]);
    const html = renderToStaticMarkup(<Fragment>{searchCatalog([first, second], { sort: "relevance" }, offers)
      .map((row) => <SearchProductCard key={row.product.id} row={row} />)}</Fragment>);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("identifies the detail-page default variant when the quoted variant differs", async () => {
    const { SearchProductCard } = await import("./search-product-card");
    const product = structuredClone(phones[0]);
    product.variants[1].offers[0].price = 100;
    product.variants[1].offers.push({ ...product.variants[1].offers[0], id: "fourth", platform: "其他平台", price: 200 });
    const row = searchCatalog([product], { sort: "relevance" })[0];
    const html = renderToStaticMarkup(<SearchProductCard row={row} />);
    expect(html).toContain("详情与历史记录默认展示：256GB · 黑色 · 国行 · 全新，与本卡报价规格不同");
    expect(html).toContain("展开其余 1 个平台报价");
    expect(html).toContain("¥8,699");
    expect(html).not.toContain("可进入详情核对");
  });
  it("includes the update year so old quotes do not appear current", async () => {
    const { SearchProductCard } = await import("./search-product-card");
    const product = structuredClone(phones[0]);
    product.variants[0].offers[2].updatedAt = "2024-09-02T08:00:00Z";
    const html = renderToStaticMarkup(<SearchProductCard row={searchCatalog([product], { sort: "relevance" })[0]} />);
    expect(html).toContain(">2024/9/2</time>");
  });
  it("shows same-variant platform offers and the existing score without invented promotions", async () => {
    const { SearchProductCard } = await import("./search-product-card");
    const row = searchCatalog([phones[0]], { sort: "relevance" })[0];
    const html = renderToStaticMarkup(<SearchProductCard row={row} />);
    expect(html).toContain("¥7,599");
    expect(html).toContain("¥7,799");
    expect(html).toContain("¥7,999");
    expect(html).toContain(`PriceAI 评分：${row.valueScore}`);
    expect(html).toContain("256GB");
    expect(html).toContain("购买参考");
    expect(html.indexOf("购买参考")).toBeLessThan(html.indexOf("个平台报价"));
    expect(html).not.toContain("PriceAI 观点");
    expect(html).not.toContain("商品摘要");
    expect(html).toContain("/products/apple-iphone-16-pro#price-history-heading");
    expect(html).toContain("查看历史价格");
    expect(html).toContain("当前已收录最低价");
    expect(html).not.toMatch(/历史最低价|折扣|已售|AI 推荐/);
  });
  it("renders unavailable states without a zero price or fabricated score", async () => {
    const { SearchProductCard } = await import("./search-product-card");
    const row = searchCatalog([{ ...phones[0], variants: [], image: "", description: "" }], { sort: "relevance" })[0];
    const html = renderToStaticMarkup(<SearchProductCard row={row} />);
    expect(html).toContain("暂无有效报价");
    expect(html).toContain("暂无数据");
    expect(html).toContain("商品图片待补充");
    expect(html).not.toContain("¥0");
    expect(html).not.toContain("商品摘要");
  });
});
