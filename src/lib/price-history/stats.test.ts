import { describe, expect, it } from "vitest";

import { calculatePriceHistoryStats } from "./stats";
import type { PriceHistoryPoint } from "./types";

const point = (price: number, recordedAt: string): PriceHistoryPoint => ({
  id: `${price}-${recordedAt}`,
  productId: "product",
  variantId: "variant",
  platform: "mock-marketplace",
  externalOfferId: null,
  price,
  originalPrice: null,
  currency: "CNY",
  recordedAt,
  createdAt: recordedAt,
});

describe("calculatePriceHistoryStats", () => {
  it("returns nullable statistics for empty history", () => {
    expect(calculatePriceHistoryStats([])).toEqual({
      currentPrice: null,
      historicalLow: null,
      historicalHigh: null,
      averagePrice: null,
      sampleCount: 0,
      currentPriceDistanceFromLowPercent: null,
      currentPriceRangePositionPercent: null,
    });
  });

  it("calculates current, low, high, average and current-price positions", () => {
    const stats = calculatePriceHistoryStats([
      point(100, "2026-08-01T00:00:00Z"),
      point(80, "2026-08-10T00:00:00Z"),
      point(90, "2026-08-20T00:00:00Z"),
    ]);

    expect(stats).toEqual({
      currentPrice: 90,
      historicalLow: 80,
      historicalHigh: 100,
      averagePrice: 90,
      sampleCount: 3,
      currentPriceDistanceFromLowPercent: 12.5,
      currentPriceRangePositionPercent: 50,
    });
  });

  it("handles one sample and equal prices without dividing by zero", () => {
    expect(calculatePriceHistoryStats([point(100, "2026-08-01T00:00:00Z")])).toMatchObject({
      currentPrice: 100,
      historicalLow: 100,
      historicalHigh: 100,
      averagePrice: 100,
      sampleCount: 1,
      currentPriceDistanceFromLowPercent: 0,
      currentPriceRangePositionPercent: 0,
    });
  });

  it("keeps a zero price valid while avoiding an undefined low-price percentage", () => {
    expect(calculatePriceHistoryStats([
      point(0, "2026-08-01T00:00:00Z"),
      point(10, "2026-08-02T00:00:00Z"),
    ])).toMatchObject({
      currentPrice: 10,
      historicalLow: 0,
      currentPriceDistanceFromLowPercent: null,
      currentPriceRangePositionPercent: 100,
    });
  });

  it("ignores malformed points when calculating statistics", () => {
    const malformed = { ...point(1, "bad-date"), price: Number.NaN };
    expect(calculatePriceHistoryStats([point(50, "2026-08-01T00:00:00Z"), malformed])).toMatchObject({
      currentPrice: 50,
      sampleCount: 1,
    });
  });
});
