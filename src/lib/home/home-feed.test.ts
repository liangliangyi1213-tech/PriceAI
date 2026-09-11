import { describe, expect, it } from "vitest";

import { phones } from "@/data/phones";
import { searchCatalog, type ProductSearchRow } from "@/lib/search/products";
import type { Product } from "@/types/catalog";

import { buildHomeDailyHighlights, buildHomeDiscoveryItems, buildHomeRecommendationFeed } from "./home-feed";

function rowForCategory(category: string): ProductSearchRow {
  const row = searchCatalog([phones[0]], { sort: "relevance" })[0];
  return { ...row, product: { ...row.product, category } as Product };
}

describe("home recommendation feed", () => {
  it("uses a popular heading when no personalization result exists", () => {
    const rows = searchCatalog(phones, { sort: "score_desc" });
    const feed = buildHomeRecommendationFeed(rows);

    expect(feed.mode).toBe("fallback");
    expect(feed.heading).toBe("热门值得买");
    expect(feed.description).toContain("暂无足够的个性化数据");
    expect(feed.items).toHaveLength(4);
  });

  it("only labels a feed personalized when both preferences and personalized rows exist", () => {
    const rows = searchCatalog(phones, { sort: "score_desc" });
    const withoutResults = buildHomeRecommendationFeed(rows, {
      signals: { searchKeywords: ["小米"] },
    });
    const personalized = buildHomeRecommendationFeed(rows, {
      signals: { searchKeywords: ["小米"] },
      personalizedRows: [rows[1]],
    });

    expect(withoutResults.heading).toBe("热门值得买");
    expect(personalized.mode).toBe("personalized");
    expect(personalized.heading).toBe("为你推荐");
    expect(personalized.items).toEqual([rows[1]]);
  });

  it("keeps daily highlights distinct from the popular recommendation fallback", () => {
    const rows = searchCatalog(phones, { sort: "score_desc" });
    const daily = buildHomeDailyHighlights(rows);
    const feed = buildHomeRecommendationFeed(rows, {
      excludedProductIds: daily.map((item) => item.row.product.id),
    });

    expect(daily).toHaveLength(2);
    expect(daily.every((item) => item.reason.length > 0)).toBe(true);
    expect(feed.items.some((row) => daily.some((item) => item.row.product.id === row.product.id))).toBe(false);
  });

  it("derives discovery categories from the shared registry rather than phones", () => {
    const items = buildHomeDiscoveryItems([
      rowForCategory("clothing"),
      rowForCategory("laptop"),
      rowForCategory("headphones"),
      rowForCategory("appliance"),
    ]);

    expect(items.map((item) => item.category)).toEqual(["服饰", "电脑", "耳机", "家电"]);
    expect(items.every((item) => item.image === null)).toBe(true);
    expect(items.every((item) => item.reasonText.length > 0)).toBe(true);
    expect(items.some((item) => item.reasonType === "多平台价差")).toBe(true);
    expect(items.every((item) => item.href.startsWith("/products/"))).toBe(true);
  });

  it("preserves a usable catalog image in the category-agnostic discovery model", () => {
    const row = rowForCategory("clothing");
    const withImage = {
      ...row,
      product: { ...row.product, image: "https://catalog.example.test/product.webp" },
    };

    const [item] = buildHomeDiscoveryItems([withImage]);

    expect(item).toMatchObject({
      category: "服饰",
      image: "https://catalog.example.test/product.webp",
      title: row.product.name,
    });
  });
});
