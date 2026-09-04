import { calculatePriceHistoryStats } from "./stats";
import type {
  PriceHistoryChartPoint,
  PriceHistoryJudgment,
  PriceHistoryPoint,
  PriceHistoryStats,
  PriceHistoryViewModel,
} from "./types";

function isRenderablePoint(point: PriceHistoryPoint): boolean {
  return Number.isFinite(point.price) && point.price >= 0 && Number.isFinite(Date.parse(point.recordedAt));
}

function formatPrice(price: number): string {
  return `¥${price.toLocaleString("zh-CN")}`;
}

export function getPriceHistoryJudgment(
  stats: Pick<PriceHistoryStats, "sampleCount" | "historicalLow" | "historicalHigh" | "currentPriceRangePositionPercent">,
): PriceHistoryJudgment {
  if (!stats.sampleCount) return { kind: "no_history", label: "暂无历史价格数据" };
  if (stats.sampleCount === 1) return { kind: "insufficient_history", label: "历史样本不足" };
  if (stats.historicalLow === null || stats.historicalHigh === null) return { kind: "no_history", label: "暂无历史价格数据" };
  if (stats.historicalLow === stats.historicalHigh) return { kind: "stable", label: "历史价格保持稳定" };

  const position = stats.currentPriceRangePositionPercent;
  if (position === null || !Number.isFinite(position)) return { kind: "insufficient_history", label: "历史样本不足" };
  if (position <= 20) return { kind: "near_low", label: "接近历史低价" };
  if (position < 50) return { kind: "low", label: "价格处于较低区间" };
  if (position <= 80) return { kind: "normal", label: "价格处于正常区间" };
  return { kind: "high", label: "价格处于较高区间" };
}

function buildSummary(stats: PriceHistoryStats, judgment: PriceHistoryJudgment): string {
  if (judgment.kind === "no_history") return "暂无足够的历史价格数据。";
  if (stats.currentPrice === null) return "暂无足够的历史价格数据。";
  if (judgment.kind === "insufficient_history") return `当前价格 ${formatPrice(stats.currentPrice)}，历史样本不足，暂无法判断趋势。`;
  if (judgment.kind === "stable") return `当前价格 ${formatPrice(stats.currentPrice)}，历史价格基本保持一致。`;
  if (judgment.kind === "near_low") return `当前价格 ${formatPrice(stats.currentPrice)}，接近历史最低价。`;
  if (stats.currentPriceDistanceFromLowPercent === null) return `当前价格 ${formatPrice(stats.currentPrice)}，${judgment.label}。`;
  return `当前价格比历史最低价高 ${stats.currentPriceDistanceFromLowPercent}% ，目前${judgment.label}。`;
}

/** Builds sorted, presentation-safe trend data without moving statistics into UI components. */
export function buildPriceHistoryViewModel(history: PriceHistoryPoint[]): PriceHistoryViewModel {
  const validHistory = history.filter(isRenderablePoint).toSorted((left, right) => Date.parse(left.recordedAt) - Date.parse(right.recordedAt));
  const stats = calculatePriceHistoryStats(validHistory);
  const judgment = getPriceHistoryJudgment(stats);
  const lastIndex = validHistory.length - 1;
  const points: PriceHistoryChartPoint[] = validHistory.map((point, index) => ({
    ...point,
    isCurrent: index === lastIndex,
    isHistoricalLow: stats.historicalLow !== null && point.price === stats.historicalLow,
  }));

  return { points, stats, judgment, summary: buildSummary(stats, judgment) };
}
