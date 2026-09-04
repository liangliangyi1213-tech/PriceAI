import "server-only";

import type { PlatformAdapter, PlatformSearchOptions } from "@/lib/platforms/types";
import type { Product } from "@/types/catalog";

import { buildCatalogSyncPlan } from "./plan";
import type { CatalogSyncPlan, CatalogSyncResult, CatalogSyncWriter } from "./types";

function safeFailure(identity: string): { offerIdentity: string; message: string } { return { offerIdentity: identity, message: "写入商品目录失败。" }; }

export function createCatalogSyncService({ writer, products }: { writer: CatalogSyncWriter; products: Product[] }) {
  return {
    async syncAdapterSearch(adapter: PlatformAdapter, query: string, options: PlatformSearchOptions & { collectedAt?: string } = {}): Promise<CatalogSyncResult> {
      const { collectedAt, ...searchOptions } = options;
      return this.persistPlan(buildCatalogSyncPlan(await adapter.searchProducts(query, searchOptions), products, collectedAt));
    },
    async persistPlan(plan: CatalogSyncPlan): Promise<CatalogSyncResult> {
      let persisted = 0; let snapshotsRecorded = 0;
      const writeFailures: CatalogSyncResult["writeFailures"] = [];
      for (const offer of plan.matchedOffers) {
        try { await writer.upsertOffer(offer); persisted++; if ((await writer.recordPriceSnapshotIfNeeded(offer)).recorded) snapshotsRecorded++; }
        catch { writeFailures.push(safeFailure(offer.offerIdentity)); }
      }
      return { plan, persisted, snapshotsRecorded, writeFailures };
    },
  };
}
