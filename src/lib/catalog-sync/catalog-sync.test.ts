import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { phones } from "@/data/phones";
import { MockPlatformAdapter } from "@/lib/platforms/mock-platform-adapter";

import { buildCatalogSyncPlan, createCatalogSyncService, createOfferIdentity, normalizePlatformSearchResult } from "./index";
import type { CatalogSyncWriter } from "./types";

const valid = {
  platform: "jd" as const,
  externalProductId: "apple-iphone-16-pro",
  externalVariantId: "apple-iphone-16-pro-256-black",
  title: " Apple iPhone 16 Pro  256 GB 黑色 ",
  price: 7999,
  originalPrice: 8299,
  imageUrl: "https://example.test/iphone.png",
  shopName: " 京东自营 ",
  rating: 4.9,
  sales: 12000,
  productUrl: "https://example.test/products/iphone",
};

describe("catalog sync normalization and matching", () => {
  it("normalizes whitespace, case, storage and color", () => {
    const normalized = normalizePlatformSearchResult(valid, "2026-09-01T00:00:00.000Z");
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.value).toMatchObject({ brand: "Apple", model: "iPhone 16 Pro", storage: "256GB", color: "黑色", shopName: "京东自营" });
  });

  it("rejects invalid prices and safely removes invalid URLs", () => {
    expect(normalizePlatformSearchResult({ ...valid, price: -1 }).ok).toBe(false);
    const normalized = normalizePlatformSearchResult({ ...valid, productUrl: "not-a-url" });
    expect(normalized.ok).toBe(true);
    if (normalized.ok) expect(normalized.value.productUrl).toBeNull();
  });

  it("does not confuse iPhone 16 Pro with iPhone 16 or 256GB with 512GB", () => {
    const pro = buildCatalogSyncPlan([valid], phones);
    expect(pro.matchedOffers).toHaveLength(1);
    expect(pro.matchedOffers[0].variant.storage).toBe("256GB");

    const mismatch = buildCatalogSyncPlan([{ ...valid, title: "Apple iPhone 16 256GB 黑色", externalProductId: "apple-iphone-16" }], phones);
    expect(mismatch.matchedOffers[0].product.slug).toBe("apple-iphone-16");
    const wrongStorage = buildCatalogSyncPlan([{ ...valid, title: "Apple iPhone 16 Pro 512GB 黑色" }], phones);
    expect(wrongStorage.unmatchedItems).toHaveLength(1);
  });

  it("keeps unmatched, ambiguous and rejected records isolated in the plan", () => {
    const plan = buildCatalogSyncPlan([
      valid,
      { ...valid, externalProductId: "unknown-phone", title: "Unknown Phone 256GB 黑色" },
      { ...valid, price: Number.NaN },
    ], phones);
    expect(plan.summary).toMatchObject({ input: 3, normalized: 2, matched: 1, unmatched: 1, rejected: 1, ambiguous: 0 });
  });

  it("keeps an ambiguous SKU out of the write plan instead of guessing", () => {
    const duplicateSkuCatalog = phones.map((product) => product.slug !== "apple-iphone-16-pro" ? product : {
      ...product,
      variants: [...product.variants, { ...product.variants[0], id: "duplicate-iphone-256" }],
    });
    const plan = buildCatalogSyncPlan([valid], duplicateSkuCatalog);
    expect(plan.ambiguousItems).toHaveLength(1);
    expect(plan.matchedOffers).toHaveLength(0);
  });

  it("creates stable identities without relying on titles", () => {
    const first = createOfferIdentity(valid.platform, valid.externalProductId, valid.externalVariantId, "256GB", "黑色");
    const second = createOfferIdentity(valid.platform, valid.externalProductId, valid.externalVariantId, "256GB", "黑色");
    const fallback = createOfferIdentity("jd", "product", undefined, "256GB", "黑色");
    expect(first).toBe(second);
    expect(first).not.toContain(valid.title);
    expect(fallback).toBe("jd:product:256GB:黑色");
  });
});

describe("catalog sync service", () => {
  it("uses MockPlatformAdapter data end-to-end, upserts once and snapshots only when needed", async () => {
    const adapter = new MockPlatformAdapter(phones.map((product) => ({
      ...product,
      variants: product.variants.map((variant) => ({ ...variant, offers: variant.offers.map((offer) => ({ ...offer, url: "https://example.test/offer" })) })),
    })));
    const writer: CatalogSyncWriter = {
      upsertOffer: vi.fn().mockResolvedValue(undefined),
      recordPriceSnapshotIfNeeded: vi.fn().mockResolvedValue({ recorded: true }),
    };
    const service = createCatalogSyncService({ writer, products: phones });
    const first = await service.syncAdapterSearch(adapter, "iPhone 16 Pro", { collectedAt: "2026-09-01T10:00:00.000Z" });
    const second = await service.syncAdapterSearch(adapter, "iPhone 16 Pro", { collectedAt: "2026-09-01T10:01:00.000Z" });
    expect(first.persisted).toBeGreaterThan(0);
    expect(second.persisted).toBe(first.persisted);
    expect(writer.upsertOffer).toHaveBeenCalledTimes(first.persisted + second.persisted);
    expect(writer.recordPriceSnapshotIfNeeded).toHaveBeenCalled();
  });

  it("continues after a single writer failure", async () => {
    const writer: CatalogSyncWriter = {
      upsertOffer: vi.fn()
        .mockRejectedValueOnce(new Error("provider response contains secret"))
        .mockResolvedValue(undefined),
      recordPriceSnapshotIfNeeded: vi.fn().mockResolvedValue({ recorded: true }),
    };
    const plan = buildCatalogSyncPlan([valid, { ...valid, externalVariantId: "apple-iphone-16-pro-512-white", title: "Apple iPhone 16 Pro 512GB 白色" }], phones);
    const result = await createCatalogSyncService({ writer, products: phones }).persistPlan(plan);
    expect(result.persisted).toBe(1);
    expect(result.writeFailures).toHaveLength(1);
    expect(result.writeFailures[0].message).not.toContain("secret");
  });
});
