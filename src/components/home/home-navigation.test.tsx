import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { phones } from "@/data/phones";
import { buildHomeDailyHighlights } from "@/lib/home/home-feed";
import { searchCatalog } from "@/lib/search/products";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("home shopping navigation", () => {
  it("uses the generic rankings entry from the hero discovery area", async () => {
    const { HeroDiscovery } = await import("./hero-discovery");
    const highlights = buildHomeDailyHighlights(searchCatalog(phones, { sort: "score_desc" }));
    const html = renderToStaticMarkup(<HeroDiscovery highlights={highlights} />);

    expect(html).toContain('href="/rankings"');
    expect(html).not.toContain('href="/rankings/phones"');
  });

  it("provides a stable compare-search target around the real search input", async () => {
    const { SearchForm } = await import("@/components/search/search-form");
    const html = renderToStaticMarkup(<SearchForm align="start" />);

    expect(html).toContain('id="compare-search"');
    expect(html).toContain('id="compare-search-input"');
  });

  it("links registered categories to generic search contexts without phone ranking routes", async () => {
    const { HomeCategoryNav } = await import("./home-category-nav");
    const html = renderToStaticMarkup(<HomeCategoryNav />);

    expect(html).toContain('/search?category=clothing');
    expect(html).toContain('/search?category=computers');
    expect(html).toContain('/search?category=headphones');
    expect(html).toContain('/search?category=appliances');
    expect(html).not.toContain('/rankings/phones');
    expect(html).toContain("即将支持");
  });
});
