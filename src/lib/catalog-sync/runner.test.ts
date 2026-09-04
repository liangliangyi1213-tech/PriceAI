import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { phones } from "@/data/phones";
import { MockPlatformAdapter } from "@/lib/platforms/mock-platform-adapter";
import { PlatformRateLimitError } from "@/lib/platforms/errors";
import type { PlatformAdapter } from "@/lib/platforms/types";

import { createCatalogSyncRunner } from "./runner";
import type { CatalogSyncWriter } from "./types";

const validAdapter = new MockPlatformAdapter(phones.map((product) => ({
  ...product,
  variants: product.variants.map((variant) => ({ ...variant, offers: variant.offers.map((offer) => ({ ...offer, url: "https://example.test/offer" })) })),
})));

function writer(): CatalogSyncWriter {
  return { upsertOffer: vi.fn().mockResolvedValue(undefined), recordPriceSnapshotIfNeeded: vi.fn().mockResolvedValue({ recorded: true }) };
}

describe("CatalogSyncRunner", () => {
  it("creates a complete dry-run preview without calling the writer", async () => {
    const syncWriter = writer();
    const result = await createCatalogSyncRunner({ products: phones, writer: syncWriter, getAdapter: () => validAdapter })
      .runCatalogSync({ platform: "mock", query: "iPhone 16 Pro", dryRun: true, collectedAt: "2026-09-01T10:00:00.000Z" });
    expect(result.dryRun).toBe(true);
    expect(result.preview).toMatchObject({ platform: "mock", query: "iPhone 16 Pro", fetchedCount: 6, matchedCount: 6, offerUpserts: 6, priceHistorySnapshots: 6 });
    expect(syncWriter.upsertOffer).not.toHaveBeenCalled();
    expect(syncWriter.recordPriceSnapshotIfNeeded).not.toHaveBeenCalled();
  });

  it("writes only matched offers in normal mode", async () => {
    const syncWriter = writer();
    const result = await createCatalogSyncRunner({ products: phones, writer: syncWriter, getAdapter: () => validAdapter })
      .runCatalogSync({ platform: "mock", query: "iPhone 16 Pro", dryRun: false });
    expect(result.dryRun).toBe(false);
    expect(result.syncResult?.persisted).toBe(6);
    expect(syncWriter.upsertOffer).toHaveBeenCalledTimes(6);
    expect(syncWriter.recordPriceSnapshotIfNeeded).toHaveBeenCalledTimes(6);
  });

  it("does not call the writer when adapter search fails", async () => {
    const syncWriter = writer();
    const unavailable: PlatformAdapter = { id: "mock", searchProducts: vi.fn().mockRejectedValue(new PlatformRateLimitError("mock")) };
    await expect(createCatalogSyncRunner({ products: phones, writer: syncWriter, getAdapter: () => unavailable })
      .runCatalogSync({ platform: "mock", query: "phone", dryRun: false })).rejects.toMatchObject({ name: "PlatformRateLimitError" });
    expect(syncWriter.upsertOffer).not.toHaveBeenCalled();
  });

  it("returns safe writer failures while retaining the rest of the batch", async () => {
    const syncWriter: CatalogSyncWriter = { upsertOffer: vi.fn().mockRejectedValueOnce(new Error("Authorization: private-token")).mockResolvedValue(undefined), recordPriceSnapshotIfNeeded: vi.fn().mockResolvedValue({ recorded: true }) };
    const result = await createCatalogSyncRunner({ products: phones, writer: syncWriter, getAdapter: () => validAdapter })
      .runCatalogSync({ platform: "mock", query: "iPhone 16 Pro", dryRun: false });
    expect(result.syncResult?.writeFailures).toHaveLength(1);
    expect(result.syncResult?.writeFailures[0].message).not.toContain("private-token");
    expect(result.syncResult?.persisted).toBe(5);
  });

  it("never writes unmatched, ambiguous, or rejected entries", async () => {
    const syncWriter = writer();
    const mixed: PlatformAdapter = {
      id: "mock",
      searchProducts: vi.fn().mockResolvedValue([
        { platform: "jd", externalProductId: "apple-iphone-16-pro", externalVariantId: "valid", title: "Apple iPhone 16 Pro 256GB 黑色", price: 7599, shopName: "商城", rating: 4.9, sales: 100, productUrl: "https://example.test/a" },
        { platform: "jd", externalProductId: "unknown", externalVariantId: "unknown", title: "Unknown Phone 256GB 黑色", price: 1000, shopName: "商城", rating: 4.9, sales: 100, productUrl: "https://example.test/b" },
        { platform: "jd", externalProductId: "apple-iphone-16-pro", externalVariantId: "bad", title: "Apple iPhone 16 Pro 256GB 黑色", price: -1, shopName: "商城", rating: 4.9, sales: 100, productUrl: "https://example.test/c" },
      ]),
    };
    const result = await createCatalogSyncRunner({ products: phones, writer: syncWriter, getAdapter: () => mixed }).runCatalogSync({ platform: "mock", query: "phone", dryRun: false });
    expect(result.preview).toMatchObject({ matchedCount: 1, unmatchedCount: 1, rejectedCount: 1, offerUpserts: 1 });
    expect(syncWriter.upsertOffer).toHaveBeenCalledTimes(1);
  });

  it("generates the same offer identities for repeated dry-run batches", async () => {
    const runner = createCatalogSyncRunner({ products: phones, writer: writer(), getAdapter: () => validAdapter });
    const first = await runner.runCatalogSync({ platform: "mock", query: "iPhone 16 Pro", dryRun: true });
    const second = await runner.runCatalogSync({ platform: "mock", query: "iPhone 16 Pro", dryRun: true });
    expect(second.preview.matchedItems.map((item) => item.offerIdentity)).toEqual(first.preview.matchedItems.map((item) => item.offerIdentity));
  });

  it("does not write an ambiguous SKU", async () => {
    const syncWriter = writer();
    const duplicateCatalog = phones.map((product) => product.slug !== "apple-iphone-16-pro" ? product : { ...product, variants: [...product.variants, { ...product.variants[0], id: "ambiguous-variant" }] });
    const result = await createCatalogSyncRunner({ products: duplicateCatalog, writer: syncWriter, getAdapter: () => validAdapter })
      .runCatalogSync({ platform: "mock", query: "iPhone 16 Pro", dryRun: false });
    expect(result.preview.ambiguousCount).toBe(3);
    expect(syncWriter.upsertOffer).toHaveBeenCalledTimes(3);
  });
});
