import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getCatalogSyncWriteClient: vi.fn() }));
vi.mock("@/lib/catalog-sync/write-client", () => ({ getCatalogSyncWriteClient: mocks.getCatalogSyncWriteClient }));

import type { ProductImageRow } from "@/lib/supabase/database.types";
import { SupabaseCatalogImageWorkbenchRepository } from "./workbench-repository";

const candidateRow: ProductImageRow = {
  id: "candidate-1", product_id: "product-1", variant_id: null, target_type: "product",
  role: "gallery", status: "candidate", is_primary: false, platform: "taobao",
  external_product_id: "external-1", external_variant_id: null, source_kind: "pict_url",
  source_url: "https://img.alicdn.com/candidate.jpg", source_host: "img.alicdn.com",
  source_url_hash: "a".repeat(64), match_confidence: 1,
  match_evidence: { schemaVersion: 1, matcher: "taobao_phone_strict", matchLevel: "product", signals: ["brand", "model"] },
  verification_method: null, verified_at: null, verified_by: null, rejection_reason: null,
  unavailable_reason: null, content_hash: null, storage_bucket: null, storage_object_path: null,
  first_seen_at: "2026-09-10T00:00:00.000Z", last_seen_at: "2026-09-12T00:00:00.000Z",
  status_changed_at: "2026-09-10T00:00:00.000Z", created_at: "2026-09-10T00:00:00.000Z",
  updated_at: "2026-09-12T00:00:00.000Z",
};

describe("Catalog image workbench repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads only candidates and the related Catalog identity, primary and event records", async () => {
    const candidateOrder = vi.fn().mockResolvedValue({ data: [candidateRow], error: null });
    const candidateEq = vi.fn(() => ({ order: candidateOrder }));
    const primaryIn = vi.fn().mockResolvedValue({ data: [], error: null });
    const primaryIs = vi.fn(() => ({ in: primaryIn }));
    const primaryRole = vi.fn(() => ({ eq: primaryIs }));
    const primaryStatus = vi.fn(() => ({ eq: primaryRole }));
    let imageSelectCount = 0;
    const productIn = vi.fn().mockResolvedValue({ data: [{ id: "product-1", name: "示例商品", category: "phone" }], error: null });
    const variantIn = vi.fn().mockResolvedValue({ data: [], error: null });
    const eventOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const eventIn = vi.fn(() => ({ order: eventOrder }));
    const from = vi.fn((table: string) => {
      if (table === "product_images") return { select: vi.fn(() => imageSelectCount++ === 0 ? { eq: candidateEq } : { eq: primaryStatus }) };
      if (table === "products") return { select: vi.fn(() => ({ in: productIn })) };
      if (table === "product_variants") return { select: vi.fn(() => ({ in: variantIn })) };
      if (table === "product_image_primary_events") return { select: vi.fn(() => ({ in: eventIn })) };
      throw new Error(`unexpected table ${table}`);
    });
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from });

    await expect(new SupabaseCatalogImageWorkbenchRepository().load()).resolves.toMatchObject({
      candidates: [{ id: "candidate-1", status: "candidate" }],
      products: [{ id: "product-1", name: "示例商品", category: "phone" }],
    });
    expect(candidateEq).toHaveBeenCalledWith("status", "candidate");
    expect(candidateOrder).toHaveBeenCalledWith("first_seen_at", { ascending: true });
    expect(primaryStatus).toHaveBeenCalledWith("status", "approved");
    expect(primaryRole).toHaveBeenCalledWith("role", "primary");
    expect(primaryIs).toHaveBeenCalledWith("is_primary", true);
    expect(productIn).toHaveBeenCalledWith("id", ["product-1"]);
  });
});
