import "server-only";

import { getSupabase } from "@/lib/supabase/client";
import type { PriceHistoryRow } from "@/lib/supabase/database.types";

import { mapPriceHistoryRow } from "./mapper";
import { calculatePriceHistoryStats } from "./stats";
import type { PriceHistoryPoint, PriceHistoryRange, PriceHistoryStats, PriceSnapshotInput } from "./types";
import { getPriceHistoryWriteClient } from "./write-client";

export class PriceHistoryRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriceHistoryRepositoryError";
  }
}

function logRepositoryFailure(operation: "read" | "write", error: unknown): void {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  console.error(`[PriceAI][PriceHistory] ${operation} failed`, {
    name: typeof record.name === "string" ? record.name : "UnknownError",
    status: typeof record.status === "number" ? record.status : null,
    code: typeof record.code === "string" ? record.code : null,
  });
}

function assertSnapshotInput(input: PriceSnapshotInput): void {
  if (!input.productId || !input.variantId || !input.platform || !Number.isFinite(input.price) || input.price < 0) {
    throw new PriceHistoryRepositoryError("价格快照数据无效。");
  }
  if (input.originalPrice !== undefined && input.originalPrice !== null && (!Number.isFinite(input.originalPrice) || input.originalPrice < 0)) {
    throw new PriceHistoryRepositoryError("价格快照数据无效。");
  }
  if (input.recordedAt && !Number.isFinite(Date.parse(input.recordedAt))) {
    throw new PriceHistoryRepositoryError("价格快照数据无效。");
  }
}

export async function recordPriceSnapshot(input: PriceSnapshotInput): Promise<void> {
  assertSnapshotInput(input);

  try {
    const { error } = await getPriceHistoryWriteClient().from("price_history").insert({
      product_id: input.productId,
      variant_id: input.variantId,
      platform: input.platform,
      external_offer_id: input.externalOfferId ?? null,
      price: input.price,
      original_price: input.originalPrice ?? null,
      currency: input.currency ?? "CNY",
      recorded_at: input.recordedAt ?? new Date().toISOString(),
    });
    if (error) throw error;
  } catch (error) {
    logRepositoryFailure("write", error);
    throw new PriceHistoryRepositoryError("记录价格历史失败，请稍后重试。");
  }
}

export async function getVariantPriceHistory(variantId: string, range: PriceHistoryRange = {}): Promise<PriceHistoryPoint[]> {
  try {
    let query = getSupabase().from("price_history").select("*").eq("variant_id", variantId);
    if (range.from) query = query.gte("recorded_at", range.from);
    if (range.to) query = query.lte("recorded_at", range.to);
    const { data, error } = await query.order("recorded_at", { ascending: true });
    if (error) throw error;

    return ((data ?? []) as PriceHistoryRow[]).map(mapPriceHistoryRow).filter((point): point is PriceHistoryPoint => point !== null);
  } catch (error) {
    logRepositoryFailure("read", error);
    throw new PriceHistoryRepositoryError("读取价格历史失败，请稍后重试。");
  }
}

export async function getVariantPriceStats(variantId: string, range: PriceHistoryRange = {}): Promise<PriceHistoryStats> {
  return calculatePriceHistoryStats(await getVariantPriceHistory(variantId, range));
}
