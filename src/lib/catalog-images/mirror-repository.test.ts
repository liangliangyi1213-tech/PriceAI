import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getCatalogSyncWriteClient: vi.fn() }));
vi.mock("@/lib/catalog-sync/write-client", () => ({
  getCatalogSyncWriteClient: mocks.getCatalogSyncWriteClient,
}));

import type { ProductImageRow } from "@/lib/supabase/database.types";

import { CatalogImageRepositoryError, SupabaseCatalogImageRepository } from "./repository";

const row: ProductImageRow = {
  id: "image-1", product_id: "product-1", variant_id: null, target_type: "product",
  role: "primary", status: "approved", is_primary: true, platform: "taobao",
  external_product_id: "listing-1", external_variant_id: null, source_kind: "pict_url",
  source_url: "https://img.alicdn.com/product.png", source_host: "img.alicdn.com",
  source_url_hash: "a".repeat(64), match_confidence: 1, match_evidence: { matcher: "strict" },
  verification_method: "manual_cross_check", verified_at: "2026-09-01T00:00:00.000Z",
  verified_by: "reviewer", rejection_reason: null, unavailable_reason: null, content_hash: null,
  storage_bucket: null, storage_object_path: null, content_type: null, width: null, height: null,
  mirrored_at: null, last_checked_at: null, first_seen_at: "2026-09-01T00:00:00.000Z",
  last_seen_at: "2026-09-01T00:00:00.000Z", status_changed_at: "2026-09-01T00:00:00.000Z",
  created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z",
};

describe("Catalog image mirror repository boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the image, Product category, and exact Variant ownership from server-side tables", async () => {
    const imageMaybeSingle = vi.fn().mockResolvedValue({ data: { ...row, variant_id: "variant-1", target_type: "variant" }, error: null });
    const productMaybeSingle = vi.fn().mockResolvedValue({ data: { id: "product-1", category: "phones" }, error: null });
    const variantMaybeSingle = vi.fn().mockResolvedValue({ data: { id: "variant-1" }, error: null });
    const from = vi.fn((table: string) => {
      if (table === "product_images") return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: imageMaybeSingle })) })) };
      if (table === "products") return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: productMaybeSingle })) })) };
      if (table === "product_variants") return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: variantMaybeSingle })) })) })),
      };
      throw new Error("unexpected table");
    });
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from });

    await expect(new SupabaseCatalogImageRepository().getMirrorContext("image-1")).resolves.toMatchObject({
      category: "phones", variantBelongsToProduct: true,
      image: { id: "image-1", productId: "product-1", variantId: "variant-1", targetType: "variant" },
    });
    expect(from).toHaveBeenCalledWith("product_images");
    expect(from).toHaveBeenCalledWith("products");
    expect(from).toHaveBeenCalledWith("product_variants");
  });

  it("updates only mirror metadata and guards the immutable source identity", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "image-1" }, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const eq = vi.fn();
    const is = vi.fn();
    const chain = { eq, is, select };
    eq.mockReturnValue(chain);
    is.mockReturnValue(chain);
    const update = vi.fn(() => chain);
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ update })) });

    await new SupabaseCatalogImageRepository().updateMirrorMetadata({
      imageId: "image-1", expectedProductId: "product-1", expectedVariantId: null,
      expectedTargetType: "product", expectedPlatform: "taobao",
      expectedSourceUrlHash: "a".repeat(64), storageBucket: "catalog-images",
      storageObjectPath: "products/product-1/image-1/hash.png", contentHash: "b".repeat(64),
      contentType: "image/png", width: 100, height: 200,
      mirroredAt: "2026-09-14T00:00:00.000Z", lastCheckedAt: "2026-09-14T00:00:00.000Z",
    });

    expect(update).toHaveBeenCalledWith({
      storage_bucket: "catalog-images", storage_object_path: "products/product-1/image-1/hash.png",
      content_hash: "b".repeat(64), content_type: "image/png", width: 100, height: 200,
      mirrored_at: "2026-09-14T00:00:00.000Z", last_checked_at: "2026-09-14T00:00:00.000Z",
    });
    expect(eq).toHaveBeenCalledWith("id", "image-1");
    expect(eq).toHaveBeenCalledWith("product_id", "product-1");
    expect(eq).toHaveBeenCalledWith("target_type", "product");
    expect(eq).toHaveBeenCalledWith("platform", "taobao");
    expect(is).toHaveBeenCalledWith("variant_id", null);
    expect(eq).toHaveBeenCalledWith("source_url_hash", "a".repeat(64));
  });

  it("returns a safe repository error when the guarded metadata update finds no row", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const chain = { eq: vi.fn(), is: vi.fn(), select: vi.fn(() => ({ maybeSingle })) };
    chain.eq.mockReturnValue(chain);
    chain.is.mockReturnValue(chain);
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ update: vi.fn(() => chain) })) });

    await expect(new SupabaseCatalogImageRepository().updateMirrorMetadata({
      imageId: "image-1", expectedProductId: "product-1", expectedVariantId: null,
      expectedTargetType: "product", expectedPlatform: "taobao",
      expectedSourceUrlHash: "a".repeat(64), storageBucket: "catalog-images",
      storageObjectPath: "path", contentHash: "b".repeat(64), contentType: "image/png",
      width: 1, height: 1, mirroredAt: "2026-09-14T00:00:00.000Z", lastCheckedAt: "2026-09-14T00:00:00.000Z",
    })).rejects.toEqual(new CatalogImageRepositoryError());
  });
});
