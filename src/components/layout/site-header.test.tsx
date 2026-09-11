import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

describe("SiteHeader", () => {
  beforeEach(() => {
    navigation.pathname = "/";
  });

  it("links the global rankings navigation to the category index", async () => {
    const { SiteHeader } = await import("./site-header");
    const html = renderToStaticMarkup(<SiteHeader />);

    expect(html).toContain('href="/rankings"');
    expect(html).toContain(">榜单</a>");
    expect(html).not.toContain("手机榜单");
    expect(html).toContain('href="/#compare-search"');
  });

  it("marks rankings and its nested pages as the same active navigation section", async () => {
    navigation.pathname = "/rankings/phones";
    const { SiteHeader } = await import("./site-header");
    const html = renderToStaticMarkup(<SiteHeader />);

    expect(html).toContain('href="/rankings"');
    expect(html).toContain('aria-current="page"');
  });
});
