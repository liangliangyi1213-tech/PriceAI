import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getCatalogSyncWriteClient: vi.fn() }));
vi.mock("@/lib/catalog-sync/write-client", () => ({
  getCatalogSyncWriteClient: mocks.getCatalogSyncWriteClient,
}));

import { CatalogImageRepositoryError, SupabaseCatalogImageRepository } from "./repository";
import type { ProductImageRow } from "@/lib/supabase/database.types";
import type { CreateCatalogImageCandidate } from "./types";

const approvedRow: ProductImageRow = {
  id: "image-1", product_id: "product-1", variant_id: null,
  target_type: "product", role: "primary", status: "approved", is_primary: true,
  platform: "taobao", external_product_id: "tb-1", external_variant_id: null,
  source_kind: "pict_url", source_url: "https://img.alicdn.com/product.jpg",
  source_host: "img.alicdn.com", source_url_hash: "a".repeat(64),
  match_confidence: 0.98, match_evidence: { method: "manual" },
  verification_method: "manual", verified_at: "2026-09-12T00:00:00.000Z", verified_by: "reviewer",
  rejection_reason: null, unavailable_reason: null, content_hash: null,
  storage_bucket: null, storage_object_path: null,
  first_seen_at: "2026-09-12T00:00:00.000Z", last_seen_at: "2026-09-12T00:00:00.000Z",
  status_changed_at: "2026-09-12T00:00:00.000Z", created_at: "2026-09-12T00:00:00.000Z",
  updated_at: "2026-09-12T00:00:00.000Z",
};

function candidateInput(overrides: Partial<CreateCatalogImageCandidate> = {}): CreateCatalogImageCandidate {
  return {
    productId: "product-1", variantId: null, targetType: "product", platform: "taobao",
    externalProductId: "tb-1", externalVariantId: null, sourceKind: "pict_url",
    sourceUrl: "https://img.alicdn.com/catalog/source.jpg", matchConfidence: 1,
    matchEvidence: { schemaVersion: 1, matcher: "taobao_phone_strict", matchLevel: "product", signals: ["brand", "model"] },
    ...overrides,
  };
}

function rejectedLookup(data: Array<Pick<ProductImageRow, "status" | "rejection_reason" | "status_changed_at">>) {
  const limit = vi.fn().mockResolvedValue({ data, error: null });
  const builder = {
    select: vi.fn(), eq: vi.fn(), is: vi.fn(), limit,
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.is.mockReturnValue(builder);
  return builder;
}

describe("SupabaseCatalogImageRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads only approved primary images for the requested product", async () => {
    const inProduct = vi.fn().mockResolvedValue({ data: [approvedRow], error: null });
    const eqIsPrimary = vi.fn(() => ({ in: inProduct }));
    const eqPrimary = vi.fn(() => ({ eq: eqIsPrimary }));
    const eqApproved = vi.fn(() => ({ eq: eqPrimary }));
    const select = vi.fn(() => ({ eq: eqApproved }));
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ select })) });

    await expect(new SupabaseCatalogImageRepository().getApprovedPrimaries("product-1"))
      .resolves.toHaveLength(1);
    expect(eqApproved).toHaveBeenCalledWith("status", "approved");
    expect(eqPrimary).toHaveBeenCalledWith("role", "primary");
    expect(eqIsPrimary).toHaveBeenCalledWith("is_primary", true);
    expect(inProduct).toHaveBeenCalledWith("product_id", ["product-1"]);
  });

  it("batch reads only active approved primaries for the requested Products", async () => {
    const inProducts = vi.fn().mockResolvedValue({ data: [approvedRow], error: null });
    const eqIsPrimary = vi.fn(() => ({ in: inProducts }));
    const eqPrimary = vi.fn(() => ({ eq: eqIsPrimary }));
    const eqApproved = vi.fn(() => ({ eq: eqPrimary }));
    const select = vi.fn(() => ({ eq: eqApproved }));
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ select })) });

    await expect(new SupabaseCatalogImageRepository().getApprovedPrimariesForProducts(["product-1", "product-2"]))
      .resolves.toHaveLength(1);
    expect(eqApproved).toHaveBeenCalledWith("status", "approved");
    expect(eqPrimary).toHaveBeenCalledWith("role", "primary");
    expect(eqIsPrimary).toHaveBeenCalledWith("is_primary", true);
    expect(inProducts).toHaveBeenCalledWith("product_id", ["product-1", "product-2"]);
  });

  it("creates a candidate without approving or assigning it as primary", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { ...approvedRow, status: "candidate", role: "gallery", is_primary: false, verified_at: null },
      error: null,
    });
    const selectAfterInsert = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select: selectAfterInsert }));
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ insert })) });

    await new SupabaseCatalogImageRepository().createCandidateIfAbsent({
      productId: "product-1",
      variantId: null,
      targetType: "product",
      platform: "taobao",
      externalProductId: "tb-1",
      externalVariantId: null,
      sourceKind: "pict_url",
      sourceUrl: "https://img.alicdn.com/product.jpg",
      matchConfidence: 0.98,
      matchEvidence: { schemaVersion: 1, matcher: "taobao_phone_strict", matchLevel: "product", signals: ["brand", "model"] },
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      status: "candidate",
      role: "gallery",
      is_primary: false,
      match_confidence: 0.98,
      match_evidence: { schemaVersion: 1, matcher: "taobao_phone_strict", matchLevel: "product", signals: ["brand", "model"] },
      verified_at: null,
      source_url_hash: createHash("sha256").update("https://img.alicdn.com/product.jpg").digest("hex"),
    }));
  });

  it("counts only active Candidates for one Product and platform", async () => {
    const eqStatus = vi.fn().mockResolvedValue({ count: 3, error: null });
    const eqPlatform = vi.fn(() => ({ eq: eqStatus }));
    const eqProduct = vi.fn(() => ({ eq: eqPlatform }));
    const select = vi.fn(() => ({ eq: eqProduct }));
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ select })) });

    await expect(new SupabaseCatalogImageRepository().countActiveCandidates("product-1", "taobao"))
      .resolves.toBe(3);
    expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(eqProduct).toHaveBeenCalledWith("product_id", "product-1");
    expect(eqPlatform).toHaveBeenCalledWith("platform", "taobao");
    expect(eqStatus).toHaveBeenCalledWith("status", "candidate");
  });

  it("reads only active Candidates for one Product and platform without mutation", async () => {
    const eqStatus = vi.fn().mockResolvedValue({
      data: [{ ...approvedRow, status: "candidate", role: "gallery", is_primary: false, verified_at: null }],
      error: null,
    });
    const eqPlatform = vi.fn(() => ({ eq: eqStatus }));
    const eqProduct = vi.fn(() => ({ eq: eqPlatform }));
    const select = vi.fn(() => ({ eq: eqProduct }));
    const from = vi.fn(() => ({ select }));
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from });

    await expect(new SupabaseCatalogImageRepository().getActiveCandidates("product-1", "taobao"))
      .resolves.toHaveLength(1);
    expect(select).toHaveBeenCalledWith("*");
    expect(eqProduct).toHaveBeenCalledWith("product_id", "product-1");
    expect(eqPlatform).toHaveBeenCalledWith("platform", "taobao");
    expect(eqStatus).toHaveBeenCalledWith("status", "candidate");
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("queries a rejected product source by its complete NULL-safe stable identity", async () => {
    const query = rejectedLookup([{
      status: "rejected", rejection_reason: "营销元素过多", status_changed_at: "2025-01-01T00:00:00.000Z",
    }]);
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => query) });

    await expect(new SupabaseCatalogImageRepository().getRejectedSourceSuppression(
      candidateInput({ sourceUrl: "https://img.alicdn.com/catalog/folder/../source.jpg" }),
      new Date("2026-10-13T12:00:00.000Z"),
    )).resolves.toBe("manual_rejection");

    expect(query.eq).toHaveBeenCalledWith("status", "rejected");
    expect(query.eq).toHaveBeenCalledWith("product_id", "product-1");
    expect(query.eq).toHaveBeenCalledWith("target_type", "product");
    expect(query.eq).toHaveBeenCalledWith("platform", "taobao");
    expect(query.eq).toHaveBeenCalledWith("external_product_id", "tb-1");
    expect(query.eq).toHaveBeenCalledWith(
      "source_url_hash",
      createHash("sha256").update("https://img.alicdn.com/catalog/source.jpg").digest("hex"),
    );
    expect(query.is).toHaveBeenCalledWith("variant_id", null);
    expect(query.is).toHaveBeenCalledWith("external_variant_id", null);
  });

  it("keeps variant scope and platform identity isolated when checking rejected sources", async () => {
    const query = rejectedLookup([]);
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => query) });

    await expect(new SupabaseCatalogImageRepository().getRejectedSourceSuppression(candidateInput({
      productId: "product-2", variantId: "variant-2", targetType: "variant", platform: "pdd",
      externalProductId: "pdd-2", externalVariantId: "sku-2",
      matchEvidence: { schemaVersion: 1, matcher: "pinduoduo_phone_strict", matchLevel: "variant", signals: ["brand", "model", "storage"] },
    }))).resolves.toBeNull();

    expect(query.eq).toHaveBeenCalledWith("product_id", "product-2");
    expect(query.eq).toHaveBeenCalledWith("variant_id", "variant-2");
    expect(query.eq).toHaveBeenCalledWith("target_type", "variant");
    expect(query.eq).toHaveBeenCalledWith("platform", "pdd");
    expect(query.eq).toHaveBeenCalledWith("external_product_id", "pdd-2");
    expect(query.eq).toHaveBeenCalledWith("external_variant_id", "sku-2");
  });

  it("does not treat an approved primary row as rejected suppression", async () => {
    const query = rejectedLookup([{
      status: "approved", rejection_reason: "old text", status_changed_at: "2026-10-13T11:00:00.000Z",
    }]);
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => query) });

    await expect(new SupabaseCatalogImageRepository().getRejectedSourceSuppression(candidateInput()))
      .resolves.toBeNull();
    expect(query.eq).toHaveBeenCalledWith("status", "rejected");
  });

  it("treats a duplicate active source bound to the same target as idempotent", async () => {
    const duplicateError = { code: "23505", message: "duplicate key value" };
    const single = vi.fn().mockResolvedValue({ data: null, error: duplicateError });
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { ...approvedRow, status: "candidate", role: "gallery", is_primary: false, verified_at: null },
      error: null,
    });
    const isExternalVariant = vi.fn(() => ({ maybeSingle }));
    const inStatus = vi.fn(() => ({ is: isExternalVariant }));
    const eqHash = vi.fn(() => ({ in: inStatus }));
    const eqExternalProduct = vi.fn(() => ({ eq: eqHash }));
    const eqPlatform = vi.fn(() => ({ eq: eqExternalProduct }));
    const select = vi.fn(() => ({ eq: eqPlatform }));
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ insert, select })) });

    await expect(new SupabaseCatalogImageRepository().createCandidateIfAbsent({
      productId: "product-1", variantId: null, targetType: "product",
      platform: "taobao", externalProductId: "tb-1", externalVariantId: null,
      sourceKind: "pict_url", sourceUrl: "https://img.alicdn.com/product.jpg",
      matchConfidence: 0.98,
      matchEvidence: { schemaVersion: 1, matcher: "taobao_phone_strict", matchLevel: "product", signals: ["brand", "model"] },
    })).resolves.toEqual({ status: "duplicate", imageId: "image-1" });
    expect(isExternalVariant).toHaveBeenCalledWith("external_variant_id", null);
  });

  it("rejects a duplicate source that is already bound to another Catalog target", async () => {
    const duplicateError = { code: "23505", message: "duplicate key value" };
    const single = vi.fn().mockResolvedValue({ data: null, error: duplicateError });
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { ...approvedRow, product_id: "another-product", status: "candidate", role: "gallery", is_primary: false, verified_at: null },
      error: null,
    });
    const select = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => ({ is: vi.fn(() => ({ maybeSingle })) })),
          })),
        })),
      })),
    }));
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ insert, select })) });

    await expect(new SupabaseCatalogImageRepository().createCandidateIfAbsent({
      productId: "product-1", variantId: null, targetType: "product",
      platform: "taobao", externalProductId: "tb-1", externalVariantId: null,
      sourceKind: "pict_url", sourceUrl: "https://img.alicdn.com/product.jpg",
      matchConfidence: 0.98,
      matchEvidence: { schemaVersion: 1, matcher: "taobao_phone_strict", matchLevel: "product", signals: ["brand", "model"] },
    })).rejects.toEqual(new CatalogImageRepositoryError());
  });

  it("only appends primary events and exposes no update or delete method", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ insert })) });
    const repository = new SupabaseCatalogImageRepository();

    await repository.appendPrimaryEvent({
      productId: "product-1",
      variantId: null,
      targetType: "product",
      previousImageId: null,
      newImageId: "image-1",
      action: "initial",
      reason: "首次审核主图",
      changedBy: "reviewer",
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ action: "initial", new_image_id: "image-1" }));
    expect("updatePrimaryEvent" in repository).toBe(false);
    expect("deletePrimaryEvent" in repository).toBe(false);
  });

  it("converts database failures into a safe repository error", async () => {
    const inProduct = vi.fn().mockResolvedValue({ data: null, error: new Error("credential detail") });
    const eqIsPrimary = vi.fn(() => ({ in: inProduct }));
    const eqPrimary = vi.fn(() => ({ eq: eqIsPrimary }));
    const eqApproved = vi.fn(() => ({ eq: eqPrimary }));
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ select: vi.fn(() => ({ eq: eqApproved })) })) });

    await expect(new SupabaseCatalogImageRepository().getApprovedPrimaries("product-1"))
      .rejects.toEqual(new CatalogImageRepositoryError());
  });
});
