import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { phones } from "@/data/phones";
import { buildHomeDailyHighlights, buildHomeDiscoveryItems, buildHomeRecommendationFeed } from "@/lib/home/home-feed";
import { searchCatalog } from "@/lib/search/products";

describe("home recommendation and discovery sections", () => {
  it("does not render a fake visual for an invalid catalog image", async () => {
    const { DiscoveryImage } = await import("./discovery-image");
    const invalid = renderToStaticMarkup(<DiscoveryImage image="/phone-placeholder.svg" title="示例商品" />);
    const valid = renderToStaticMarkup(<DiscoveryImage image="https://catalog.example.test/product.webp" title="示例商品" />);

    expect(invalid).toBe("");
    expect(valid).toContain("<img");
    expect(valid).toContain("catalog.example.test/product.webp");
  });

  it("labels recommendation fallback honestly and uses the generic ranking entry", async () => {
    const { FeaturedProducts } = await import("./featured-products");
    const feed = buildHomeRecommendationFeed(searchCatalog(phones, { sort: "score_desc" }));
    const html = renderToStaticMarkup(<FeaturedProducts feed={feed} />);

    expect(html).toContain("热门值得买");
    expect(html).not.toContain(">为你推荐<");
    expect(html).toContain("暂无足够的个性化数据");
    expect(html).toContain('data-mobile-scroll="contained"');
    expect(html).toContain("-mx-4");
    expect(html).toContain("scroll-px-4");
    expect(html).toContain("overscroll-x-contain");
    expect(html).toContain("min-w-[calc(100%-2rem)]");
    expect(html).toContain("左右滑动查看更多");
    expect(html).toContain('href="/rankings"');
    expect(html).not.toContain('href="/rankings/phones"');
  });

  it("renders daily highlights with factual signals", async () => {
    const { HeroDiscovery } = await import("./hero-discovery");
    const highlights = buildHomeDailyHighlights(searchCatalog(phones, { sort: "score_desc" }));
    const html = renderToStaticMarkup(<HeroDiscovery highlights={highlights} />);

    expect(html).toContain("今日值得关注");
    expect(html).toContain("已核验决策信号");
    expect(html).toContain("个平台报价");
  });

  it("renders image-led discovery cards with category and factual reasons", async () => {
    const { ShoppingDiscovery } = await import("./shopping-discovery");
    const rows = searchCatalog(phones, { sort: "score_desc" }).slice(0, 4);
    const items = buildHomeDiscoveryItems(rows);
    const html = renderToStaticMarkup(<ShoppingDiscovery items={items} />);

    expect((html.match(/data-discovery-item=/g) ?? []).length).toBe(4);
    expect(html).not.toContain("商品图片待补充");
    expect(html).not.toContain("PriceAI 精选");
    expect(html).not.toContain("<img");
    expect(html).toContain("手机");
    expect(html).toContain("最高与最低相差");
    expect(html).toContain('data-mobile-scroll="contained"');
    expect(html).toContain("snap-mandatory");
    expect(html).toContain("scroll-px-4");
    expect(html).toContain("overscroll-x-contain");
    expect(html).toContain("min-w-[calc(100%-2rem)]");
    expect(html).toContain("左右滑动查看更多");
    expect(html).toContain('href="/rankings"');
    expect(html).not.toContain('href="/rankings/phones"');
  });
});
