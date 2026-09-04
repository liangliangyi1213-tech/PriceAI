import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { phones } from "@/data/phones";
import { searchCatalog } from "@/lib/search/products";
import { SearchFilters } from "./search-filters";

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
