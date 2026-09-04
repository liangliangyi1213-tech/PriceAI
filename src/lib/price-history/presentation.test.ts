import { describe, expect, it } from "vitest";

import { buildPriceHistoryViewModel, getPriceHistoryJudgment } from "./presentation";
import type { PriceHistoryPoint } from "./types";

const point = (price: number, recordedAt: string, platform = "mock-marketplace"): PriceHistoryPoint => ({
  id: `${price}-${recordedAt}`,
  productId: "product",
  variantId: "variant",
  platform,
  externalOfferId: null,
  price,
  originalPrice: null,
  currency: "CNY",
  recordedAt,
  createdAt: recordedAt,
});

describe("price history presentation", () => {
  it("sorts unsorted history and maps chart-ready points", () => {
    const view = buildPriceHistoryViewModel([
      point(90, "2026-08-20T00:00:00Z", "mock-pdd"),
      point(100, "2026-08-01T00:00:00Z", "mock-jd"),
      point(80, "2026-08-10T00:00:00Z", "mock-taobao"),
    ]);

    expect(view.points.map((item) => item.price)).toEqual([100, 80, 90]);
    expect(view.points[1]).toMatchObject({ isHistoricalLow: true, isCurrent: false, platform: "mock-taobao" });
    expect(view.points[2]).toMatchObject({ isCurrent: true, isHistoricalLow: false });
    expect(view.stats).toMatchObject({ currentPrice: 90, historicalLow: 80, historicalHigh: 100, sampleCount: 3 });
  });

  it("labels a current historical-low price as near low", () => {
    const view = buildPriceHistoryViewModel([point(100, "2026-08-01T00:00:00Z"), point(80, "2026-08-02T00:00:00Z")]);

    expect(view.judgment.kind).toBe("near_low");
    expect(view.summary).toContain("接近历史最低价");
  });

  it("labels a current historical-high price as high", () => {
    expect(buildPriceHistoryViewModel([point(80, "2026-08-01T00:00:00Z"), point(100, "2026-08-02T00:00:00Z")]).judgment.kind).toBe("high");
  });

  it("labels a middle price as normal", () => {
    expect(buildPriceHistoryViewModel([
      point(100, "2026-08-01T00:00:00Z"),
      point(80, "2026-08-02T00:00:00Z"),
      point(90, "2026-08-03T00:00:00Z"),
    ]).judgment.kind).toBe("normal");
  });

  it("uses safe judgement for one sample and identical prices", () => {
    expect(buildPriceHistoryViewModel([point(100, "2026-08-01T00:00:00Z")]).judgment.kind).toBe("insufficient_history");
    expect(buildPriceHistoryViewModel([
      point(100, "2026-08-01T00:00:00Z"),
      point(100, "2026-08-02T00:00:00Z"),
    ]).judgment.kind).toBe("stable");
  });

  it("uses an empty state for no history", () => {
    const view = buildPriceHistoryViewModel([]);

    expect(view.judgment.kind).toBe("no_history");
    expect(view.points).toEqual([]);
    expect(view.summary).toBe("暂无足够的历史价格数据。");
  });

  it("filters invalid prices before presentation", () => {
    const invalid = { ...point(Number.NaN, "2026-08-01T00:00:00Z"), recordedAt: "invalid" };
    const view = buildPriceHistoryViewModel([invalid, point(100, "2026-08-02T00:00:00Z")]);

    expect(view.points).toHaveLength(1);
    expect(view.stats.sampleCount).toBe(1);
  });

  it("handles a historical low of zero without an invalid percentage", () => {
    const view = buildPriceHistoryViewModel([point(0, "2026-08-01T00:00:00Z"), point(10, "2026-08-02T00:00:00Z")]);

    expect(view.stats.currentPriceDistanceFromLowPercent).toBeNull();
    expect(view.judgment.kind).toBe("high");
  });

  it("keeps judgement boundaries deterministic", () => {
    expect(getPriceHistoryJudgment({ currentPriceRangePositionPercent: 20, sampleCount: 2, historicalHigh: 100, historicalLow: 0 }).kind).toBe("near_low");
    expect(getPriceHistoryJudgment({ currentPriceRangePositionPercent: 20.01, sampleCount: 2, historicalHigh: 100, historicalLow: 0 }).kind).toBe("low");
    expect(getPriceHistoryJudgment({ currentPriceRangePositionPercent: 50, sampleCount: 2, historicalHigh: 100, historicalLow: 0 }).kind).toBe("normal");
    expect(getPriceHistoryJudgment({ currentPriceRangePositionPercent: 80.01, sampleCount: 2, historicalHigh: 100, historicalLow: 0 }).kind).toBe("high");
  });
});
