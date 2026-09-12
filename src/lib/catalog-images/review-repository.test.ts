import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getCatalogSyncWriteClient: vi.fn() }));
vi.mock("@/lib/catalog-sync/write-client", () => ({
  getCatalogSyncWriteClient: mocks.getCatalogSyncWriteClient,
}));

import { CatalogImageRepositoryError, SupabaseCatalogImageRepository } from "./repository";
import type { ProductImageRow } from "@/lib/supabase/database.types";

const candidateRow: ProductImageRow = {
  id: "image-1", product_id: "xiaomi-15", variant_id: null,
  target_type: "product", role: "gallery", status: "candidate", is_primary: false,
  platform: "taobao", external_product_id: "tb-1", external_variant_id: null,
  source_kind: "pict_url", source_url: "https://img.alicdn.com/product.jpg",
  source_host: "img.alicdn.com", source_url_hash: "a".repeat(64),
  match_confidence: 1,
  match_evidence: { schemaVersion: 1, matcher: "taobao_phone_strict", matchLevel: "product", signals: ["brand", "model"] },
  verification_method: null, verified_at: null, verified_by: null,
  rejection_reason: null, unavailable_reason: null, content_hash: null,
  storage_bucket: null, storage_object_path: null,
  first_seen_at: "2026-09-12T00:00:00.000Z", last_seen_at: "2026-09-12T00:00:00.000Z",
  status_changed_at: "2026-09-12T00:00:00.000Z", created_at: "2026-09-12T00:00:00.000Z",
  updated_at: "2026-09-12T00:00:00.000Z",
};

describe("catalog image review repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the image and verifies its Product target still exists", async () => {
    const imageMaybeSingle = vi.fn().mockResolvedValue({ data: candidateRow, error: null });
    const productMaybeSingle = vi.fn().mockResolvedValue({ data: { id: "xiaomi-15" }, error: null });
    const from = vi.fn((table: string) => {
      if (table === "product_images") return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: imageMaybeSingle })) })) };
      if (table === "products") return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: productMaybeSingle })) })) };
      throw new Error(`unexpected table ${table}`);
    });
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from });

    await expect(new SupabaseCatalogImageRepository().getReviewContext("image-1"))
      .resolves.toMatchObject({ productExists: true, variantBelongsToProduct: true, image: { id: "image-1" } });
  });

  it("approves only a current candidate and persists reviewer evidence", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { ...candidateRow, status: "approved", verified_at: "2026-09-12T08:00:00.000Z" },
      error: null,
    });
    const eqStatus = vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle })) }));
    const eqId = vi.fn(() => ({ eq: eqStatus }));
    const update = vi.fn(() => ({ eq: eqId }));
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ update })) });

    await new SupabaseCatalogImageRepository().approveCandidate({
      imageId: "image-1",
      reviewer: "catalog-reviewer",
      reviewMethod: "manual",
      verifiedAt: "2026-09-12T08:00:00.000Z",
      matchConfidence: 1,
      matchEvidence: candidateRow.match_evidence as Record<string, unknown>,
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: "approved",
      verified_at: "2026-09-12T08:00:00.000Z",
      verified_by: "catalog-reviewer",
      verification_method: "manual",
      match_confidence: 1,
      match_evidence: candidateRow.match_evidence,
    }));
    expect(eqStatus).toHaveBeenCalledWith("status", "candidate");
  });

  it("rejects an invalid image only while it is still a candidate", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "image-1" }, error: null });
    const eqStatus = vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle })) }));
    const eqId = vi.fn(() => ({ eq: eqStatus }));
    const update = vi.fn(() => ({ eq: eqId }));
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ update })) });

    await new SupabaseCatalogImageRepository().rejectCandidate({ imageId: "image-1", reason: "source_not_allowed" });
    expect(update).toHaveBeenCalledWith({ status: "rejected", rejection_reason: "source_not_allowed" });
    expect(eqStatus).toHaveBeenCalledWith("status", "candidate");
  });

  it("promotes through one RPC that returns the append-only event identity", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        promoted_image_id: "image-1",
        replaced_image_id: "image-old",
        promotion_action: "replace",
        primary_event_id: "event-1",
      }],
      error: null,
    });
    mocks.getCatalogSyncWriteClient.mockReturnValue({ rpc });

    await expect(new SupabaseCatalogImageRepository().promotePrimary({
      imageId: "image-1", action: "replace", reviewer: "catalog-reviewer", reason: "better verified image",
    })).resolves.toEqual({
      imageId: "image-1", previousImageId: "image-old", action: "replace", eventId: "event-1",
    });
    expect(rpc).toHaveBeenCalledWith("promote_product_image_primary", {
      p_image_id: "image-1",
      p_action: "replace",
      p_reason: "better verified image",
      p_changed_by: "catalog-reviewer",
    });
  });

  it("converts an RPC conflict into a safe repository error", async () => {
    mocks.getCatalogSyncWriteClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "internal SQL detail" } }),
    });
    await expect(new SupabaseCatalogImageRepository().promotePrimary({
      imageId: "image-1", action: "initial", reviewer: "reviewer", reason: "initial",
    })).rejects.toEqual(new CatalogImageRepositoryError());
  });
});
