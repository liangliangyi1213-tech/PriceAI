import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { phones } from "@/data/phones";
import { MockPlatformAdapter } from "@/lib/platforms/mock-platform-adapter";
import { PlatformAuthError } from "@/lib/platforms/errors";
import type { PlatformAdapter } from "@/lib/platforms/types";

import { createCatalogSyncRunner } from "./runner";
import type { CatalogSyncRunRepository, CatalogSyncWriter } from "./types";

const adapter = new MockPlatformAdapter(phones.map((product) => ({ ...product, variants: product.variants.map((variant) => ({ ...variant, offers: variant.offers.map((offer) => ({ ...offer, url: "https://example.test/offer" })) })) })));
function writer(): CatalogSyncWriter { return { upsertOffer: vi.fn().mockResolvedValue(undefined), recordPriceSnapshotIfNeeded: vi.fn().mockResolvedValue({ recorded: true }) }; }
function runs() {
  return { createCatalogSyncRun: vi.fn().mockResolvedValue({ id: "run-1", startedAt: "2026-09-01T10:00:00.000Z" }), completeCatalogSyncRun: vi.fn().mockResolvedValue(undefined), failCatalogSyncRun: vi.fn().mockResolvedValue(undefined) } satisfies CatalogSyncRunRepository;
}

describe("CatalogSyncRunner observability", () => {
  it("records a success run for a dry-run with candidate counts", async () => {
    const repository = runs();
    const timestamps = ["2026-09-01T10:00:00.000Z", "2026-09-01T10:00:01.000Z"];
    await createCatalogSyncRunner({ products: phones, writer: writer(), runRepository: repository, getAdapter: () => adapter, now: () => new Date(timestamps.shift() ?? "2026-09-01T10:00:01.000Z") }).runCatalogSync({ platform: "mock", query: "iPhone 16 Pro", dryRun: true });
    expect(repository.completeCatalogSyncRun).toHaveBeenCalledWith("run-1", expect.objectContaining({ status: "success", fetchedCount: 6, offerUpsertCount: 6, writeFailureCount: 0, durationMs: 1000 }));
  });

  it("records partial failure when a writer item fails", async () => {
    const repository = runs(); const syncWriter: CatalogSyncWriter = { upsertOffer: vi.fn().mockRejectedValueOnce(new Error("secret")).mockResolvedValue(undefined), recordPriceSnapshotIfNeeded: vi.fn().mockResolvedValue({ recorded: true }) };
    await createCatalogSyncRunner({ products: phones, writer: syncWriter, runRepository: repository, getAdapter: () => adapter }).runCatalogSync({ platform: "mock", query: "iPhone 16 Pro", dryRun: false });
    expect(repository.completeCatalogSyncRun).toHaveBeenCalledWith("run-1", expect.objectContaining({ status: "partial_failure", writeFailureCount: 1 }));
  });

  it("marks adapter failure without leaking provider credentials", async () => {
    const repository = runs(); const failed: PlatformAdapter = { id: "mock", searchProducts: vi.fn().mockRejectedValue(new PlatformAuthError("mock")) };
    await expect(createCatalogSyncRunner({ products: phones, writer: writer(), runRepository: repository, getAdapter: () => failed }).runCatalogSync({ platform: "mock", query: "phone", dryRun: false })).rejects.toMatchObject({ name: "PlatformAuthError" });
    expect(repository.failCatalogSyncRun).toHaveBeenCalledWith("run-1", expect.objectContaining({ code: "PlatformAuthError", summary: expect.not.stringContaining("Authorization") }));
  });

  it("stops before adapter or writer work when the run record cannot be created", async () => {
    const repository = { ...runs(), createCatalogSyncRun: vi.fn().mockRejectedValue(new Error("db secret")) } satisfies CatalogSyncRunRepository;
    const syncWriter = writer(); const getAdapter = vi.fn(() => adapter);
    await expect(createCatalogSyncRunner({ products: phones, writer: syncWriter, runRepository: repository, getAdapter }).runCatalogSync({ platform: "mock", query: "phone", dryRun: false })).rejects.toMatchObject({ name: "CatalogSyncObservabilityError" });
    expect(getAdapter).not.toHaveBeenCalled(); expect(syncWriter.upsertOffer).not.toHaveBeenCalled();
  });

  it("reports an observability error when final run status cannot be saved", async () => {
    const repository = { ...runs(), completeCatalogSyncRun: vi.fn().mockRejectedValue(new Error("database detail")) } satisfies CatalogSyncRunRepository;
    const syncWriter = writer();
    await expect(createCatalogSyncRunner({ products: phones, writer: syncWriter, runRepository: repository, getAdapter: () => adapter }).runCatalogSync({ platform: "mock", query: "iPhone 16 Pro", dryRun: false })).rejects.toMatchObject({ name: "CatalogSyncObservabilityError" });
    expect(syncWriter.upsertOffer).toHaveBeenCalled();
  });
});
