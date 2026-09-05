import "server-only";

import { phones } from "@/data/phones";
import { toSafePlatformError } from "@/lib/platforms/errors";
import { getPlatformAdapter } from "@/lib/platforms/registry";
import type { PlatformAdapter, PlatformAdapterId } from "@/lib/platforms/types";
import type { Product } from "@/types/catalog";

import { buildCatalogSyncPlan } from "./plan";
import { SupabaseCatalogSyncWriter } from "./repository";
import { SupabaseCatalogSyncRunRepository } from "./run-repository";
import { createCatalogSyncService } from "./service";
import type { CatalogSyncPreview, CatalogSyncRunInput, CatalogSyncRunRepository, CatalogSyncRunResult, CatalogSyncWriter } from "./types";

export class CatalogSyncObservabilityError extends Error {
  constructor() { super("同步批次记录不可用，已停止本次同步。"); this.name = "CatalogSyncObservabilityError"; }
}

function makePreview(platform: PlatformAdapterId, query: string, fetchedCount: number, plan: ReturnType<typeof buildCatalogSyncPlan>): CatalogSyncPreview {
  const writableMatches = plan.matchedOffers.filter(({ normalized }) =>
    normalized.rating !== null && normalized.sales !== null && normalized.productUrl !== null,
  );
  return {
    platform, query, fetchedCount, matchedCount: plan.summary.matched, unmatchedCount: plan.summary.unmatched,
    ambiguousCount: plan.summary.ambiguous, rejectedCount: plan.summary.rejected,
    offerUpserts: writableMatches.length, priceHistorySnapshots: writableMatches.length,
    matchedItems: plan.matchedOffers.map((item) => ({ offerIdentity: item.offerIdentity, productId: item.product.id, variantId: item.variant.id, platform: item.normalized.platform, price: item.normalized.price })),
    unmatchedItems: plan.unmatchedItems.map((item) => ({ platform: item.platform, externalProductId: item.externalProductId, title: item.title })),
    ambiguousItems: plan.ambiguousItems.map((item) => ({ platform: item.platform, externalProductId: item.externalProductId, title: item.title })),
    rejectedItems: plan.rejectedItems.map((item) => ({ platform: item.input.platform, externalProductId: item.input.externalProductId.trim(), reason: item.reason })),
  };
}

export function createCatalogSyncRunner({
  products = phones,
  writer = new SupabaseCatalogSyncWriter(),
  runRepository = new SupabaseCatalogSyncRunRepository(),
  getAdapter = getPlatformAdapter,
  now = () => new Date(),
}: {
  products?: Product[];
  writer?: CatalogSyncWriter;
  runRepository?: CatalogSyncRunRepository;
  getAdapter?: (platform: PlatformAdapterId) => PlatformAdapter;
  now?: () => Date;
} = {}) {
  return {
    async runCatalogSync(input: CatalogSyncRunInput): Promise<CatalogSyncRunResult> {
      const startedAt = now().toISOString();
      let run;
      try { run = await runRepository.createCatalogSyncRun({ platform: input.platform, query: input.query, dryRun: input.dryRun, startedAt }); }
      catch { throw new CatalogSyncObservabilityError(); }
      const finish = () => { const finishedAt = now().toISOString(); return { finishedAt, durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)) }; };
      let adapter: PlatformAdapter;
      try { adapter = getAdapter(input.platform); }
      catch (error) {
        const safe = toSafePlatformError(input.platform, error);
        try { await runRepository.failCatalogSyncRun(run.id, { code: safe.name, summary: safe.message, ...finish() }); } catch { throw new CatalogSyncObservabilityError(); }
        throw safe;
      }
      let fetched;
      try { fetched = adapter.getRecommendedProducts ? await adapter.getRecommendedProducts() : await adapter.searchProducts(input.query); }
      catch (error) {
        const safe = toSafePlatformError(input.platform, error);
        try { await runRepository.failCatalogSyncRun(run.id, { code: safe.name, summary: safe.message, ...finish() }); } catch { throw new CatalogSyncObservabilityError(); }
        throw safe;
      }
      const plan = buildCatalogSyncPlan(fetched, products, input.collectedAt);
      const preview = makePreview(input.platform, input.query, fetched.length, plan);
      const syncResult = input.dryRun ? undefined : await createCatalogSyncService({ writer, products }).persistPlan(plan);
      const writeFailureCount = syncResult?.writeFailures.length ?? 0;
      const status = writeFailureCount ? "partial_failure" as const : "success" as const;
      try {
        await runRepository.completeCatalogSyncRun(run.id, { status, fetchedCount: preview.fetchedCount, matchedCount: preview.matchedCount, unmatchedCount: preview.unmatchedCount, ambiguousCount: preview.ambiguousCount, rejectedCount: preview.rejectedCount, offerUpsertCount: syncResult?.persisted ?? preview.offerUpserts, priceSnapshotCount: syncResult?.snapshotsRecorded ?? preview.priceHistorySnapshots, writeFailureCount, ...finish() });
      } catch { throw new CatalogSyncObservabilityError(); }
      return { runId: run.id, dryRun: input.dryRun, preview, syncResult };
    },
  };
}
