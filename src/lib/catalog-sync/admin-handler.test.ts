import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { CatalogSyncObservabilityError } from "./runner";
import { createCatalogSyncRunner } from "./runner";
import { PlatformRateLimitError } from "@/lib/platforms/errors";
import { MockPlatformAdapter } from "@/lib/platforms/mock-platform-adapter";
import { phones } from "@/data/phones";
import { handleCatalogSyncAdminRequest } from "./admin-handler";
import type { CatalogSyncRunRepository, CatalogSyncWriter } from "./types";

function request(body: unknown): Request { return new Request("http://localhost/api/admin/catalog-sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
const completed = { runId: "run-1", dryRun: true, preview: { platform: "mock" as const, query: "iphone", fetchedCount: 1, matchedCount: 1, unmatchedCount: 0, ambiguousCount: 0, rejectedCount: 0, offerUpserts: 1, priceHistorySnapshots: 1, matchedItems: [], unmatchedItems: [], ambiguousItems: [], rejectedItems: [] } };
function testRunRepository(): CatalogSyncRunRepository { return { createCatalogSyncRun: vi.fn().mockResolvedValue({ id: "run-integration", startedAt: "2026-09-01T00:00:00.000Z" }), completeCatalogSyncRun: vi.fn().mockResolvedValue(undefined), failCatalogSyncRun: vi.fn().mockResolvedValue(undefined) }; }
function testAdapter() { return new MockPlatformAdapter(phones); }

describe("catalog sync admin handler", () => {
  it("accepts the Pinduoduo recommendation pool without requiring a keyword", async () => {
    const runCatalogSync = vi.fn().mockResolvedValue(completed);
    const response = await handleCatalogSyncAdminRequest(request({ platform: "pdd", dryRun: true }), { isDevelopment: true, runner: { runCatalogSync } });

    expect(response.status).toBe(200);
    expect(runCatalogSync).toHaveBeenCalledWith({ platform: "pdd", query: "推荐商品池", dryRun: true });
  });

  it("does not persist Pinduoduo recommendations before reliable offer metadata is available", async () => {
    const runCatalogSync = vi.fn();
    const response = await handleCatalogSyncAdminRequest(request({ platform: "pdd", dryRun: false }), { isDevelopment: true, runner: { runCatalogSync } });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "拼多多推荐商品池当前仅支持预览同步。" });
    expect(runCatalogSync).not.toHaveBeenCalled();
  });


  it("runs a valid development dry-run and returns only safe preview data", async () => {
    const runCatalogSync = vi.fn().mockResolvedValue(completed);
    const response = await handleCatalogSyncAdminRequest(request({ platform: "mock", query: " iphone ", dryRun: true }), { isDevelopment: true, runner: { runCatalogSync } });
    expect(response.status).toBe(200);
    expect(runCatalogSync).toHaveBeenCalledWith({ platform: "mock", query: "iphone", dryRun: true });
    await expect(response.json()).resolves.toMatchObject({ runId: "run-1", status: "success", dryRun: true, platform: "mock" });
  });

  it("rejects non-mock platforms, empty queries, and production requests", async () => {
    await expect(handleCatalogSyncAdminRequest(request({ platform: "jd", query: "iphone", dryRun: true }), { isDevelopment: true, runner: { runCatalogSync: vi.fn() } }).then((response) => response.status)).resolves.toBe(400);
    await expect(handleCatalogSyncAdminRequest(request({ platform: "mock", query: "   ", dryRun: true }), { isDevelopment: true, runner: { runCatalogSync: vi.fn() } }).then((response) => response.status)).resolves.toBe(400);
    await expect(handleCatalogSyncAdminRequest(request({ platform: "mock", query: "iphone", dryRun: true }), { isDevelopment: false, runner: { runCatalogSync: vi.fn() } }).then((response) => response.status)).resolves.toBe(403);
  });

  it("maps runner failures to safe HTTP errors without internal details", async () => {
    const response = await handleCatalogSyncAdminRequest(request({ platform: "mock", query: "iphone", dryRun: false }), { isDevelopment: true, runner: { runCatalogSync: vi.fn().mockRejectedValue(new PlatformRateLimitError("mock")) } });
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "Mock平台请求频率受限，请稍后重试。" });

    const observability = await handleCatalogSyncAdminRequest(request({ platform: "mock", query: "iphone", dryRun: false }), { isDevelopment: true, runner: { runCatalogSync: vi.fn().mockRejectedValue(new CatalogSyncObservabilityError()) } });
    expect(observability.status).toBe(503);
    expect(JSON.stringify(await observability.json())).not.toContain("secret");
  });

  it("reports partial writer failures without exposing internal writer messages", async () => {
    const response = await handleCatalogSyncAdminRequest(request({ platform: "mock", query: "iphone", dryRun: false }), { isDevelopment: true, runner: { runCatalogSync: vi.fn().mockResolvedValue({ ...completed, dryRun: false, syncResult: { persisted: 1, snapshotsRecorded: 0, plan: {} as never, writeFailures: [{ offerIdentity: "mock:item", message: "internal secret" }] } }) } });
    expect(response.status).toBe(200);
    const payload = await handleCatalogSyncAdminRequest(request({ platform: "mock", query: "iphone", dryRun: false }), { isDevelopment: true, runner: { runCatalogSync: vi.fn().mockResolvedValue({ ...completed, dryRun: false, syncResult: { persisted: 1, snapshotsRecorded: 0, plan: {} as never, writeFailures: [{ offerIdentity: "mock:item", message: "internal secret" }] } }) } }).then((item) => item.json());
    expect(payload.status).toBe("partial_failure");
    expect(JSON.stringify(payload)).not.toContain("internal secret");
  });

  it("executes dry-run without writer mutations and formal sync through the existing runner", async () => {
    const writer: CatalogSyncWriter = { upsertOffer: vi.fn().mockResolvedValue(undefined), recordPriceSnapshotIfNeeded: vi.fn().mockResolvedValue({ recorded: true }) };
    const runner = createCatalogSyncRunner({ products: phones, writer, runRepository: testRunRepository(), getAdapter: () => testAdapter() });
    const dryResponse = await handleCatalogSyncAdminRequest(request({ platform: "mock", query: "iPhone 16 Pro", dryRun: true }), { isDevelopment: true, runner });
    expect(dryResponse.status).toBe(200); expect(writer.upsertOffer).not.toHaveBeenCalled();
    const formalResponse = await handleCatalogSyncAdminRequest(request({ platform: "mock", query: "iPhone 16 Pro", dryRun: false }), { isDevelopment: true, runner });
    expect(formalResponse.status).toBe(200); expect(writer.upsertOffer).toHaveBeenCalled(); expect(writer.recordPriceSnapshotIfNeeded).toHaveBeenCalled();
  });
});
