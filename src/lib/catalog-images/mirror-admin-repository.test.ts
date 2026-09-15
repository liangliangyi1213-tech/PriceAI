import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getCatalogSyncWriteClient: vi.fn() }));
vi.mock("@/lib/catalog-sync/write-client", () => ({ getCatalogSyncWriteClient: mocks.getCatalogSyncWriteClient }));

import type { ProductImageMirrorJobRow, ProductImageRow } from "@/lib/supabase/database.types";
import { SupabaseCatalogImageMirrorAdminRepository } from "./mirror-admin-repository";

const primary: ProductImageRow = {
  id: "image-1", product_id: "product-1", variant_id: null, target_type: "product",
  role: "primary", status: "approved", is_primary: true, platform: "taobao",
  external_product_id: "external", external_variant_id: null, source_kind: "pict_url",
  source_url: "https://img.alicdn.com/product.jpg", source_host: "img.alicdn.com",
  source_url_hash: "a".repeat(64), match_confidence: 1, match_evidence: {},
  verification_method: "manual", verified_at: "2026-09-01T00:00:00.000Z", verified_by: "admin",
  rejection_reason: null, unavailable_reason: null, content_hash: null, storage_bucket: null,
  storage_object_path: null, content_type: null, width: null, height: null, mirrored_at: null,
  last_checked_at: null, first_seen_at: "2026-09-01T00:00:00.000Z",
  last_seen_at: "2026-09-01T00:00:00.000Z", status_changed_at: "2026-09-01T00:00:00.000Z",
  created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z",
};

const job: ProductImageMirrorJobRow = {
  id: "job-1", image_id: "image-1", primary_event_id: "event-1", status: "pending",
  attempt_count: 0, next_attempt_at: null, last_error_code: null, policy_version: 1,
  created_at: "2026-09-01T00:00:00.000Z", started_at: null, completed_at: null,
  updated_at: "2026-09-01T00:00:00.000Z",
};

describe("Catalog mirror admin repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads all current primaries, identities and jobs with a fixed number of batch queries", async () => {
    const imageIs = vi.fn().mockResolvedValue({ data: [primary], error: null });
    const imageRole = vi.fn(() => ({ eq: imageIs }));
    const imageStatus = vi.fn(() => ({ eq: imageRole }));
    const productIn = vi.fn().mockResolvedValue({ data: [{ id: "product-1", name: "示例商品", category: "phone" }], error: null });
    const variantIn = vi.fn().mockResolvedValue({ data: [], error: null });
    const jobOrder = vi.fn().mockResolvedValue({ data: [job], error: null });
    const jobIn = vi.fn(() => ({ order: jobOrder }));
    const from = vi.fn((table: string) => {
      if (table === "product_images") return { select: vi.fn(() => ({ eq: imageStatus })) };
      if (table === "products") return { select: vi.fn(() => ({ in: productIn })) };
      if (table === "product_variants") return { select: vi.fn(() => ({ in: variantIn })) };
      if (table === "product_image_mirror_jobs") return { select: vi.fn(() => ({ in: jobIn })) };
      throw new Error(`unexpected table ${table}`);
    });
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from });

    await expect(new SupabaseCatalogImageMirrorAdminRepository().load()).resolves.toMatchObject({
      images: [{ image: { id: "image-1" }, productName: "示例商品", category: "phone" }],
      jobs: [{ id: "job-1", imageId: "image-1", status: "pending" }],
    });
    expect(from).toHaveBeenCalledTimes(4);
    expect(imageStatus).toHaveBeenCalledWith("status", "approved");
    expect(imageRole).toHaveBeenCalledWith("role", "primary");
    expect(imageIs).toHaveBeenCalledWith("is_primary", true);
    expect(jobIn).toHaveBeenCalledWith("image_id", ["image-1"]);
  });
});
