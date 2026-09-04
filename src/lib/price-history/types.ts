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
