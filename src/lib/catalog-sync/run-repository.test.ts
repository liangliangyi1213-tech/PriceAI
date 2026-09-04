import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getCatalogSyncWriteClient: vi.fn() }));
vi.mock("./write-client", () => ({ getCatalogSyncWriteClient: mocks.getCatalogSyncWriteClient }));

import { SupabaseCatalogSyncRunRepository } from "./run-repository";

describe("CatalogSyncRunRepository", () => {
  it("creates an independent running sync record", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "run-1" }, error: null });
    const select = vi.fn(() => ({ single })); const insert = vi.fn(() => ({ select }));
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ insert })) });
    const run = await new SupabaseCatalogSyncRunRepository().createCatalogSyncRun({ platform: "mock", query: "iPhone", dryRun: true, startedAt: "2026-09-01T10:00:00.000Z" });
    expect(run).toEqual({ id: "run-1", startedAt: "2026-09-01T10:00:00.000Z" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ status: "running", dry_run: true, platform: "mock" }));
  });

  it("completes with sanitized counts and duration", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null }); const update = vi.fn(() => ({ eq }));
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ update })) });
    await new SupabaseCatalogSyncRunRepository().completeCatalogSyncRun("run-1", { status: "partial_failure", fetchedCount: 3, matchedCount: 2, unmatchedCount: 1, ambiguousCount: 0, rejectedCount: 0, offerUpsertCount: 2, priceSnapshotCount: 1, writeFailureCount: 1, finishedAt: "2026-09-01T10:00:01.000Z", durationMs: 1000 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "partial_failure", write_failure_count: 1, duration_ms: 1000 }));
    expect(eq).toHaveBeenCalledWith("id", "run-1");
  });

  it("stores only a safe failure code and summary", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null }); const update = vi.fn(() => ({ eq }));
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ update })) });
    await new SupabaseCatalogSyncRunRepository().failCatalogSyncRun("run-1", { code: "PlatformAuthError", summary: "平台授权不可用。", finishedAt: "2026-09-01T10:00:01.000Z", durationMs: 1000 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", error_code: "PlatformAuthError", error_summary: "平台授权不可用。" }));
  });
});
