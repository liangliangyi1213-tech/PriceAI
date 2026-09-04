import "server-only";

import { phones } from "@/data/phones";
import { toSafePlatformError } from "@/lib/platforms/errors";
import { getPlatformAdapter } from "@/lib/platforms/registry";
import type { PlatformAdapter, PlatformAdapterId } from "@/lib/platforms/types";
import type { Product } from "@/types/catalog";

import { buildCatalogSyncPlan } from "./plan";
import { SupabaseCatalogSyncWriter } from "./repository";
import { createCatalogSyncService } from "./service";
import type { CatalogSyncPreview, CatalogSyncRunInput, CatalogSyncRunResult, CatalogSyncWriter } from "./types";

function makePreview(platform: PlatformAdapterId, query: string, fetchedCount: number, plan: ReturnType<typeof buildCatalogSyncPlan>): CatalogSyncPreview {
  return {
    platform, query, fetchedCount, matchedCount: plan.summary.matched, unmatchedCount: plan.summary.unmatched,
    ambiguousCount: plan.summary.ambiguous, rejectedCount: plan.summary.rejected,
    offerUpserts: plan.summary.matched, priceHistorySnapshots: plan.summary.matched,
    matchedItems: plan.matchedOffers.map((item) => ({ offerIdentity: item.offerIdentity, productId: item.product.id, variantId: item.variant.id, platform: item.normalized.platform, price: item.normalized.price })),
    unmatchedItems: plan.unmatchedItems.map((item) => ({ platform: item.platform, externalProductId: item.externalProductId, title: item.title })),
    ambiguousItems: plan.ambiguousItems.map((item) => ({ platform: item.platform, externalProductId: item.externalProductId, title: item.title })),
    rejectedItems: plan.rejectedItems.map((item) => ({ platform: item.input.platform, externalProductId: item.input.externalProductId.trim(), reason: item.reason })),
  };
}

export function createCatalogSyncRunner({
  products = phones,
  writer = new SupabaseCatalogSyncWriter(),
  getAdapter = getPlatformAdapter,
}: {
  products?: Product[];
  writer?: CatalogSyncWriter;
  getAdapter?: (platform: PlatformAdapterId) => PlatformAdapter;
} = {}) {
  return {
    async runCatalogSync(input: CatalogSyncRunInput): Promise<CatalogSyncRunResult> {
      const adapter = getAdapter(input.platform);
      let fetched;
      try { fetched = await adapter.searchProducts(input.query); }
      catch (error) { throw toSafePlatformError(input.platform, error); }
      const plan = buildCatalogSyncPlan(fetched, products, input.collectedAt);
      const preview = makePreview(input.platform, input.query, fetched.length, plan);
      if (input.dryRun) return { dryRun: true, preview };
      const syncResult = await createCatalogSyncService({ writer, products }).persistPlan(plan);
      return { dryRun: false, preview, syncResult };
    },
  };
}
