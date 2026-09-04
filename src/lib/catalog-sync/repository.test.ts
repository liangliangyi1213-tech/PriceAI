import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getCatalogSyncWriteClient: vi.fn() }));
vi.mock("./write-client", () => ({ getCatalogSyncWriteClient: mocks.getCatalogSyncWriteClient }));

import { SupabaseCatalogSyncWriter } from "./repository";
import type { CatalogSyncWriteInput } from "./types";

const input: CatalogSyncWriteInput = {
  offerIdentity: "jd:variant-1",
  product: { id: "product-1", slug: "iphone", brand: "Apple", name: "iPhone 16 Pro", category: "phone", description: "", image: "", specs: {}, variants: [] },
  variant: { id: "variant-1", productId: "product-1", storage: "256GB", color: "黑色", region: "国行", condition: "全新", performance: 90, offers: [] },
  normalized: { platform: "jd", externalProductId: "product-1", externalVariantId: "variant-1", title: "iPhone 16 Pro", normalizedTitle: "iphone16pro", brand: "Apple", model: "iPhone 16 Pro", storage: "256GB", color: "黑色", price: 7599, originalPrice: 7999, currency: "CNY", shopName: "商城", rating: 4.9, sales: 100, imageUrl: null, productUrl: "https://example.test/offer", collectedAt: "2026-09-01T10:00:00.000Z" },
};

describe("SupabaseCatalogSyncWriter", () => {
  it("upserts by stable offer identity", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ upsert })) });
    await new SupabaseCatalogSyncWriter().upsertOffer(input);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ offer_identity: "jd:variant-1", price: 7599, variant_id: "variant-1" }), { onConflict: "offer_identity" });
  });

  it("does not add a same-price snapshot inside the one-hour window", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { price: 7599, original_price: 7999, recorded_at: "2026-09-01T09:30:00.000Z" }, error: null });
    const insert = vi.fn();
    const limit = vi.fn(() => ({ maybeSingle }));
    const order = vi.fn(() => ({ limit }));
    const eqTwo = vi.fn(() => ({ order }));
    const eqOne = vi.fn(() => ({ eq: eqTwo }));
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ select: vi.fn(() => ({ eq: eqOne })), insert })) });
    await expect(new SupabaseCatalogSyncWriter().recordPriceSnapshotIfNeeded(input)).resolves.toEqual({ recorded: false });
    expect(insert).not.toHaveBeenCalled();
  });

  it("records a changed price or a later same-price daily sample", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { price: 7599, original_price: 7999, recorded_at: "2026-08-31T09:00:00.000Z" }, error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const limit = vi.fn(() => ({ maybeSingle })); const order = vi.fn(() => ({ limit })); const eqTwo = vi.fn(() => ({ order })); const eqOne = vi.fn(() => ({ eq: eqTwo }));
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ select: vi.fn(() => ({ eq: eqOne })), insert })) });
    await expect(new SupabaseCatalogSyncWriter().recordPriceSnapshotIfNeeded(input)).resolves.toEqual({ recorded: true });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ external_offer_id: "jd:variant-1", price: 7599 }));
  });
});
