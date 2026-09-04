import "server-only";

import { getCatalogSyncWriteClient } from "./write-client";
import type { CatalogSyncRunHandle, CatalogSyncRunRepository, CompleteCatalogSyncRunInput, FailCatalogSyncRunInput } from "./types";

export class CatalogSyncRunRepositoryError extends Error {
  constructor(message = "同步批次记录操作失败。") { super(message); this.name = "CatalogSyncRunRepositoryError"; }
}

function logFailure(operation: "create" | "complete" | "fail", error: unknown): void {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  console.error(`[PriceAI][CatalogSyncRun] ${operation} failed`, { name: typeof record.name === "string" ? record.name : "UnknownError", code: typeof record.code === "string" ? record.code : null, status: typeof record.status === "number" ? record.status : null });
}

export class SupabaseCatalogSyncRunRepository implements CatalogSyncRunRepository {
  async createCatalogSyncRun(input: { platform: string; query: string; dryRun: boolean; startedAt: string }): Promise<CatalogSyncRunHandle> {
    try {
      const { data, error } = await getCatalogSyncWriteClient().from("catalog_sync_runs").insert({ platform: input.platform, query: input.query, dry_run: input.dryRun, status: "running", started_at: input.startedAt }).select("id").single();
      if (error || !data?.id) throw error ?? new Error("Missing run id");
      return { id: data.id, startedAt: input.startedAt };
    } catch (error) { logFailure("create", error); throw new CatalogSyncRunRepositoryError(); }
  }

  async completeCatalogSyncRun(id: string, input: CompleteCatalogSyncRunInput): Promise<void> {
    try {
      const { error } = await getCatalogSyncWriteClient().from("catalog_sync_runs").update({ status: input.status, fetched_count: input.fetchedCount, matched_count: input.matchedCount, unmatched_count: input.unmatchedCount, ambiguous_count: input.ambiguousCount, rejected_count: input.rejectedCount, offer_upsert_count: input.offerUpsertCount, price_snapshot_count: input.priceSnapshotCount, write_failure_count: input.writeFailureCount, finished_at: input.finishedAt, duration_ms: input.durationMs, error_code: null, error_summary: null }).eq("id", id);
      if (error) throw error;
    } catch (error) { logFailure("complete", error); throw new CatalogSyncRunRepositoryError(); }
  }

  async failCatalogSyncRun(id: string, input: FailCatalogSyncRunInput): Promise<void> {
    try {
      const { error } = await getCatalogSyncWriteClient().from("catalog_sync_runs").update({ status: "failed", finished_at: input.finishedAt, duration_ms: input.durationMs, error_code: input.code.slice(0, 80), error_summary: input.summary.slice(0, 240) }).eq("id", id);
      if (error) throw error;
    } catch (error) { logFailure("fail", error); throw new CatalogSyncRunRepositoryError(); }
  }
}
