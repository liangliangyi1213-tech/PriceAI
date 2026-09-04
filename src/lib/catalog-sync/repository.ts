import "server-only";

import type { CatalogSyncWriteInput, CatalogSyncWriter, SnapshotWriteResult } from "./types";
import { getCatalogSyncWriteClient } from "./write-client";

const SNAPSHOT_DEDUPE_WINDOW_MS = 60 * 60 * 1000;

export class CatalogSyncRepositoryError extends Error {
  constructor(message = "写入商品目录失败。") { super(message); this.name = "CatalogSyncRepositoryError"; }
}

function logFailure(operation: "offer_upsert" | "snapshot", error: unknown): void {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  console.error(`[PriceAI][CatalogSync] ${operation} failed`, {
    name: typeof record.name === "string" ? record.name : "UnknownError",
    status: typeof record.status === "number" ? record.status : null,
    code: typeof record.code === "string" ? record.code : null,
  });
}

function requiredMetadata(input: CatalogSyncWriteInput): { rating: number; sales: number; url: string } {
  const { rating, sales, productUrl } = input.normalized;
  if (rating === null || sales === null || !productUrl) throw new CatalogSyncRepositoryError("平台商品缺少写入目录所需的公开字段。");
  return { rating, sales, url: productUrl };
}

function rowFor(input: CatalogSyncWriteInput) {
  const { normalized, variant, offerIdentity } = input;
  const metadata = requiredMetadata(input);
  return {
    id: `sync:${offerIdentity}`, offer_identity: offerIdentity, variant_id: variant.id, platform: normalized.platform,
    external_product_id: normalized.externalProductId, external_variant_id: normalized.externalVariantId,
    seller: normalized.shopName, title: normalized.title, price: normalized.price, original_price: normalized.originalPrice,
    rating: metadata.rating, sales: metadata.sales, shipping: "信息未提供", warranty: "信息未提供", url: metadata.url,
    updated_at: normalized.collectedAt, last_seen_at: normalized.collectedAt, source: "platform_sync", match_confidence: 1,
  };
}

export class SupabaseCatalogSyncWriter implements CatalogSyncWriter {
  async upsertOffer(input: CatalogSyncWriteInput): Promise<void> {
    try {
      const { error } = await getCatalogSyncWriteClient().from("offers").upsert(rowFor(input), { onConflict: "offer_identity" });
      if (error) throw error;
    } catch (error) { logFailure("offer_upsert", error); throw error instanceof CatalogSyncRepositoryError ? error : new CatalogSyncRepositoryError(); }
  }

  async recordPriceSnapshotIfNeeded(input: CatalogSyncWriteInput): Promise<SnapshotWriteResult> {
    try {
      const client = getCatalogSyncWriteClient();
      const { data: latest, error: latestError } = await client.from("price_history").select("price, original_price, recorded_at")
        .eq("variant_id", input.variant.id).eq("external_offer_id", input.offerIdentity).order("recorded_at", { ascending: false }).limit(1).maybeSingle();
      if (latestError) throw latestError;
      const elapsed = latest ? Date.parse(input.normalized.collectedAt) - Date.parse(latest.recorded_at) : Number.POSITIVE_INFINITY;
      if (latest && Number(latest.price) === input.normalized.price && Number(latest.original_price ?? 0) === Number(input.normalized.originalPrice ?? 0) && elapsed >= 0 && elapsed < SNAPSHOT_DEDUPE_WINDOW_MS) return { recorded: false };
      const { error } = await client.from("price_history").insert({ product_id: input.product.id, variant_id: input.variant.id, platform: input.normalized.platform, external_offer_id: input.offerIdentity, price: input.normalized.price, original_price: input.normalized.originalPrice, currency: input.normalized.currency, recorded_at: input.normalized.collectedAt });
      if (error) throw error;
      return { recorded: true };
    } catch (error) { logFailure("snapshot", error); throw new CatalogSyncRepositoryError("记录价格历史失败。"); }
  }
}
