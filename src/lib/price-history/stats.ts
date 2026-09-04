import type { PriceHistoryPoint, PriceHistoryStats } from "./types";

function isValidPoint(point: PriceHistoryPoint): boolean {
  return Number.isFinite(point.price) && point.price >= 0 && Number.isFinite(Date.parse(point.recordedAt));
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Calculates display-ready price statistics from valid domain points only. */
export function calculatePriceHistoryStats(points: PriceHistoryPoint[]): PriceHistoryStats {
  const validPoints = points.filter(isValidPoint).toSorted((left, right) => Date.parse(left.recordedAt) - Date.parse(right.recordedAt));
  if (!validPoints.length) {
    return {
      currentPrice: null,
      historicalLow: null,
      historicalHigh: null,
      averagePrice: null,
      sampleCount: 0,
      currentPriceDistanceFromLowPercent: null,
      currentPriceRangePositionPercent: null,
    };
  }

  const prices = validPoints.map((point) => point.price);
  const currentPrice = prices.at(-1)!;
  const historicalLow = Math.min(...prices);
  const historicalHigh = Math.max(...prices);
  const averagePrice = prices.reduce((total, price) => total + price, 0) / prices.length;
  const currentPriceDistanceFromLowPercent = historicalLow === 0
    ? (currentPrice === 0 ? 0 : null)
    : roundPercent(((currentPrice - historicalLow) / historicalLow) * 100);
  const range = historicalHigh - historicalLow;
  const currentPriceRangePositionPercent = range === 0 ? 0 : roundPercent(((currentPrice - historicalLow) / range) * 100);

  return {
    currentPrice,
    historicalLow,
    historicalHigh,
    averagePrice,
    sampleCount: prices.length,
    currentPriceDistanceFromLowPercent,
    currentPriceRangePositionPercent,
  };
}
