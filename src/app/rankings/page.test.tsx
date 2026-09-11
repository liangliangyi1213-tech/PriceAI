import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => <header /> }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => <footer /> }));

describe("rankings index page", () => {
  it("links only the supported phone ranking and labels future categories honestly", async () => {
    const { default: RankingsPage } = await import("./page");
    const html = renderToStaticMarkup(<RankingsPage />);

    expect(html).toContain("PriceAI 榜单");
    expect(html).toContain('href="/rankings/phones"');
    expect(html).toContain("手机性价比榜");
    expect(html).toContain("电脑");
    expect(html).toContain("耳机");
    expect(html).toContain("家电");
    expect(html.match(/即将支持/g)).toHaveLength(3);
    expect(html).not.toContain('href="/rankings/computers"');
    expect(html).not.toContain('href="/rankings/headphones"');
    expect(html).not.toContain('href="/rankings/appliances"');
  });
});
