import { renderToStaticMarkup } from "react-dom/server";
import { Fragment } from "react";
import { describe, expect, it } from "vitest";
import { phones } from "@/data/phones";
import type { LivePinduoduoOffer } from "@/lib/search/pinduoduo-live-offer";
import type { LiveTaobaoProductOffer } from "@/lib/search/taobao-live-offer";
import { searchCatalog } from "@/lib/search/products";
import { SearchFilters } from "./search-filters";

function liveOffer(overrides: Partial<LivePinduoduoOffer> = {}): LivePinduoduoOffer {
  return {
    productId: phones[0].id,
    variantId: phones[0].variants[0].id,
    goodsId: "live-1",
    title: "Apple iPhone 16 实时商品标题",
    image: { platform: "pinduoduo", externalProductId: "live-1", url: "https://img.pddpic.com/live-phone.jpg", alt: "iPhone 16 Pro" },
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
    const html = renderToStaticMarkup(<ResultsToolbar count={3} query={{ query: "杯", brands: ["A"], minPrice: 100, sort: "relevance" }} compareSlugs={["a"]} facets={{ brands: true, price: true, score: true, rating: true, sales: true }} />);
    expect(html).toContain("brand=A&amp;minPrice=100&amp;sort=price_asc&amp;compare=a");
    expect(html).toContain('aria-label="移除品牌 A"');
    expect(html).toContain('aria-current="true"');
  });
  it("clearing filters does not discard the search keyword or selected comparisons", () => {
    const html = renderToStaticMarkup(<SearchFilters brands={["Apple"]} compareSlugs={["a"]} facets={{ brands: true, price: true, score: true, rating: true, sales: true }} searchQuery={{ query: "杯", category: "phones", brands: ["Apple"], sort: "price_asc" }} />);
    expect(html).toContain('name="category" value="phones"');
    expect(html).toContain('href="/search?q=%E6%9D%AF&amp;category=phones&amp;sort=relevance&amp;compare=a"');
  });
});

describe("product card presentation", () => {
  it("keeps product-level Taobao listings outside the catalog product card", async () => {
    const { SearchProductCard } = await import("./search-product-card");
    const target = phones.find((item) => item.slug === "xiaomi-15")!;
    const taobao: LiveTaobaoProductOffer = {
      productId: target.id,
      variantId: null,
      itemId: "tb-xiaomi-15",
      title: "Xiaomi 小米15 5G 全新手机",
      image: { platform: "taobao", externalProductId: "tb-xiaomi-15", url: "https://img.alicdn.com/xiaomi.jpg", alt: "小米 15" },
      merchant: "小米授权店",
      salePrice: 4299,
      promotionPrice: 3999,
      promotionTags: ["官方立减", "地区补贴"],
      productUrl: "https://s.click.taobao.com/example",
      source: "live",
    };
    const row = searchCatalog([target], { sort: "relevance" }, undefined, new Map([[target.id, [taobao]]] ))[0];

    const html = renderToStaticMarkup(<SearchProductCard row={row} />);

    expect(html).not.toContain("实时淘宝报价");
    expect(html).not.toContain("Xiaomi 小米15 5G 全新手机");
    expect(html).toContain("最低正式报价");
  });

  it("keeps live Pinduoduo listings outside while preserving its comparable headline price", async () => {
    const { SearchProductCard } = await import("./search-product-card");
    const offer = liveOffer();
    const row = searchCatalog([phones[0]], { sort: "relevance" }, new Map([[phones[0].id, [offer]]] ))[0];
    const html = renderToStaticMarkup(<SearchProductCard row={row} />);

    expect(html).toContain("¥6,999");
    expect(html).not.toContain("Apple iPhone 16 实时商品标题");
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
      image: null,
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
    expect(withoutLive).toContain("最低正式报价");
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
    expect(html).toContain("最低正式报价");
    expect(html).not.toContain("¥9.9");
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
    expect(html.indexOf("购买参考")).toBeLessThan(html.indexOf("同规格正式报价"));
    expect(html).not.toContain("PriceAI 观点");
    expect(html).not.toContain("商品摘要");
    expect(html).toContain("/products/apple-iphone-16-pro#price-history-heading");
    expect(html).toContain("查看历史价格");
    expect(html).toContain("最低正式报价");
    expect(html).toContain('aria-label="iPhone 16 Pro 标准商品决策卡"');
    expect(html).not.toMatch(/历史最低价|折扣|已售|AI 推荐/);
  });
  it("renders unavailable states without a zero price or fabricated score", async () => {
    const { SearchProductCard } = await import("./search-product-card");
    const row = searchCatalog([{ ...phones[0], variants: [], image: "", description: "" }], { sort: "relevance" })[0];
    const html = renderToStaticMarkup(<SearchProductCard row={row} />);
    expect(html).toContain("暂无有效报价");
    expect(html).toContain("暂无数据");
    expect(html).toContain("暂无商品图");
    expect(html).not.toContain("¥0");
    expect(html).not.toContain("商品摘要");
  });
});

describe("live Taobao offer presentation", () => {
  function taobaoOffer(overrides: Partial<LiveTaobaoProductOffer> = {}): LiveTaobaoProductOffer {
    return {
      productId: phones[0].id,
      variantId: null,
      itemId: "tb-default",
      title: "Apple iPhone 16 Pro 官方手机",
      image: { platform: "taobao", externalProductId: "tb-default", url: "https://img.alicdn.com/iphone.jpg", alt: "iPhone 16 Pro" },
      merchant: "Apple 授权店",
      salePrice: 7_999,
      promotionPrice: null,
      promotionTags: [],
      productUrl: "https://s.click.taobao.com/example",
      source: "live",
      ...overrides,
    };
  }

  it("renders one independent card per offer and keeps conditional prices explicit", async () => {
    const { LiveTaobaoOffers } = await import("./live-taobao-offers");
    const html = renderToStaticMarkup(<LiveTaobaoOffers productName="iPhone 16 Pro" offers={[
      taobaoOffer({ itemId: "one", title: "淘宝商品一", promotionPrice: 7_599, promotionTags: ["地区补贴"] }),
      taobaoOffer({ itemId: "two", title: "淘宝商品二", salePrice: 7_899 }),
    ]} />);

    expect((html.match(/data-live-offer-card=/g) ?? []).length).toBe(2);
    expect(html).toContain("淘宝商品一");
    expect(html).toContain("淘宝商品二");
    expect(html).toContain("常规成交价 ¥7,999");
    expect(html).toContain("优惠后（条件优惠价） ¥7,599");
    expect(html).toContain("需满足活动/地区/领券等条件");
    expect(html).toContain("地区补贴");
    expect(html).toContain("去淘宝看看");
    expect(html).toContain("data-platform-badge=\"淘宝\"");
    expect(html.indexOf("data-platform-badge=\"淘宝\"")).toBeLessThan(html.indexOf("data-live-offer-image=\"true\""));
    expect(html).toContain('alt="iPhone 16 Pro"');
    expect(html).toContain('data-image-platform="taobao"');
    expect(html).toContain('data-external-product-id="tb-default"');
    expect(html).not.toContain('alt="淘宝商品一"');
    expect(html).toContain("line-clamp-3");
    expect(html).toContain("data-live-offer-action=\"true\"");
  });

  it("keeps a fixed image area when an image is absent and limits promotion tags", async () => {
    const { LiveTaobaoOffers } = await import("./live-taobao-offers");
    const html = renderToStaticMarkup(<LiveTaobaoOffers productName="iPhone 16 Pro" offers={[
      taobaoOffer({
        image: null,
        promotionTags: ["官方立减", "地区补贴", "店铺券", "会员专享", "赠品"],
      }),
    ]} />);

    expect(html).toContain("data-live-offer-image=\"placeholder\"");
    expect(html).toContain("暂无商品图");
    expect(html).toContain("官方立减");
    expect(html).toContain("地区补贴");
    expect(html).toContain("店铺券");
    expect(html).not.toContain("会员专享");
    expect(html).not.toContain("赠品");
  });

  it("renders a clear unavailable action when a live listing has no safe URL", async () => {
    const { LiveTaobaoOffers } = await import("./live-taobao-offers");
    const html = renderToStaticMarkup(<LiveTaobaoOffers productName="iPhone 16 Pro" offers={[
      taobaoOffer({ productUrl: null }),
    ]} />);

    expect(html).toContain("暂无可用跳转");
    expect(html).toContain("aria-disabled=\"true\"");
  });

  it("uses the same external live-offer area and card skeleton for Pinduoduo", async () => {
    const { LiveSearchOffers } = await import("./live-search-offers");
    const html = renderToStaticMarkup(<LiveSearchOffers pinduoduoOffers={[liveOffer()]} productName="iPhone 16 Pro" taobaoOffers={[]} />);

    expect(html).toContain('aria-label="实时平台报价"');
    expect(html).toContain('data-live-offer-card="拼多多"');
    expect(html).toContain("Apple iPhone 16 实时商品标题");
    expect(html).toContain("近2小时已拼100+件");
    expect(html).toContain("券额 ¥200");
    expect(html).toContain("使用门槛 ¥1,000");
    expect(html).not.toContain("额外优惠 ¥50");
  });

  it("deduplicates exact items and conservative same-shop near-duplicates before sorting", async () => {
    const { LiveTaobaoOffers } = await import("./live-taobao-offers");
    const html = renderToStaticMarkup(<LiveTaobaoOffers productName="iPhone 16 Pro" offers={[
      taobaoOffer({ itemId: "duplicate", title: "Apple iPhone 16 Pro 官方手机", image: null, productUrl: null, salePrice: 7_999 }),
      taobaoOffer({ itemId: "duplicate", title: "Apple iPhone 16 Pro 官方手机", promotionTags: ["官方立减"], salePrice: 7_899 }),
      taobaoOffer({ itemId: "near-one", title: "Apple iPhone 16 Pro 官方手机！", salePrice: 7_799 }),
      taobaoOffer({ itemId: "other-shop", title: "Apple iPhone 16 Pro 官方手机", merchant: "另一家店", salePrice: 7_699 }),
    ]} />);

    expect((html.match(/data-live-offer-card=/g) ?? []).length).toBe(2);
    expect(html).toContain("官方立减");
    expect(html.indexOf("Apple 授权店")).toBeLessThan(html.indexOf("另一家店"));
  });

  it("keeps possible configuration or bundle differences from the same shop", async () => {
    const { LiveTaobaoOffers } = await import("./live-taobao-offers");
    const html = renderToStaticMarkup(<LiveTaobaoOffers productName="iPhone 16 Pro" offers={[
      taobaoOffer({ itemId: "standard", title: "Apple iPhone 16 Pro 256GB 官方标配" }),
      taobaoOffer({ itemId: "bundle", title: "Apple iPhone 16 Pro 256GB 充电套装", salePrice: 8_199 }),
      taobaoOffer({ itemId: "larger", title: "Apple iPhone 16 Pro 512GB 官方标配", salePrice: 9_199 }),
    ]} />);

    expect((html.match(/data-live-offer-card=/g) ?? []).length).toBe(3);
    expect(html).toContain("充电套装");
    expect(html).toContain("512GB");
  });

  it("initially renders only three offers and labels the hidden remainder", async () => {
    const { LiveTaobaoOffers } = await import("./live-taobao-offers");
    const html = renderToStaticMarkup(<LiveTaobaoOffers productName="iPhone 16 Pro" offers={[
      taobaoOffer({ itemId: "incomplete", title: "信息较少", image: null, merchant: "", productUrl: null, salePrice: 6_999 }),
      taobaoOffer({ itemId: "complete-high", title: "完整高价", salePrice: 8_199 }),
      taobaoOffer({ itemId: "complete-low", title: "完整低价", salePrice: 7_699 }),
      taobaoOffer({ itemId: "complete-mid", title: "完整中价", salePrice: 7_899 }),
    ]} />);

    expect(html.indexOf("完整低价")).toBeLessThan(html.indexOf("完整中价"));
    expect(html.indexOf("完整中价")).toBeLessThan(html.indexOf("完整高价"));
    expect(html).not.toContain("信息较少");
    expect((html.match(/data-live-offer-card=/g) ?? []).length).toBe(3);
    expect(html).toContain("查看其余 1 条淘宝报价");
    expect(html).not.toContain("收起淘宝报价");
  });

  it("does not render an expand control for three or fewer offers", async () => {
    const { LiveTaobaoOffers } = await import("./live-taobao-offers");
    const html = renderToStaticMarkup(<LiveTaobaoOffers productName="iPhone 16 Pro" offers={[
      taobaoOffer({ itemId: "one", title: "报价一" }),
      taobaoOffer({ itemId: "two", title: "报价二" }),
      taobaoOffer({ itemId: "three", title: "报价三" }),
    ]} />);

    expect((html.match(/data-live-offer-card=/g) ?? []).length).toBe(3);
    expect(html).not.toContain("查看其余");
    expect(html).not.toContain("收起淘宝报价");
  });
});
