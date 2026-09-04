export type PriceHistoryPoint = {
  id: string;
  productId: string;
  variantId: string;
  platform: string;
  externalOfferId: string | null;
  price: number;
  originalPrice: number | null;
  currency: string;
  recordedAt: string;
  createdAt: string;
};

export type PriceHistoryStats = {
  currentPrice: number | null;
  historicalLow: number | null;
  historicalHigh: number | null;
  averagePrice: number | null;
  sampleCount: number;
  currentPriceDistanceFromLowPercent: number | null;
  currentPriceRangePositionPercent: number | null;
};

export type PriceHistoryRange = {
  from?: string;
  to?: string;
};

export type PriceSnapshotInput = {
  productId: string;
  variantId: string;
  platform: string;
  externalOfferId?: string | null;
  price: number;
  originalPrice?: number | null;
  currency?: string;
  recordedAt?: string;
};

export type PriceHistoryChartPoint = PriceHistoryPoint & {
  isCurrent: boolean;
  isHistoricalLow: boolean;
};

export type PriceHistoryJudgmentKind =
  | "no_history"
  | "insufficient_history"
  | "stable"
  | "near_low"
  | "low"
  | "normal"
  | "high";

export type PriceHistoryJudgment = {
  kind: PriceHistoryJudgmentKind;
  label: string;
};

export type PriceHistoryViewModel = {
  points: PriceHistoryChartPoint[];
  stats: PriceHistoryStats;
  judgment: PriceHistoryJudgment;
  summary: string;
};
