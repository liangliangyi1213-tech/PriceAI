import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildPriceHistoryViewModel } from "@/lib/price-history/presentation";
import type { PriceHistoryPoint } from "@/lib/price-history/types";
import { PriceHistoryPanel } from "./price-history-panel";

function point(platform: string): PriceHistoryPoint {
  return {
    id: `history-${platform}`,
    productId: "product-1",
    variantId: "variant-1",
    platform,
    externalOfferId: null,
    price: platform === "mock-prod" ? 99 : 109,
    originalPrice: null,
    currency: "CNY",
    recordedAt: platform === "mock-prod" ? "2026-09-01T00:00:00Z" : "2026-09-02T00:00:00Z",
    createdAt: "2026-09-02T00:00:00Z",
  };
}

describe("price history consumer presentation", () => {
  it("marks demonstration history and never exposes its internal source identifier", () => {
    const html = renderToStaticMarkup(<PriceHistoryPanel view={buildPriceHistoryViewModel([point("mock-prod"), point("seed-phone")])} />);

    expect(html).toContain("演示历史数据，仅用于功能展示，不代表真实平台历史价格走势。");
    expect(html).toContain("演示数据");
    expect(html).not.toContain("mock-prod");
    expect(html).not.toContain("seed-phone");
  });

  it("does not label recorded platform history as demonstration data", () => {
    const html = renderToStaticMarkup(<PriceHistoryPanel view={buildPriceHistoryViewModel([point("taobao"), point("jd")])} />);

    expect(html).not.toContain("演示历史数据");
    expect(html).toContain("淘宝");
  });
});
