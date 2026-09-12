import { describe, expect, it } from "vitest";

import { mapProductImageRow } from "./mapper";
import type { ProductImageRow } from "@/lib/supabase/database.types";

const row: ProductImageRow = {
  id: "image-1",
  product_id: "product-1",
  variant_id: null,
  target_type: "product",
  role: "primary",
  status: "approved",
  is_primary: true,
  platform: "taobao",
  external_product_id: "tb-1",
  external_variant_id: null,
  source_kind: "pict_url",
  source_url: "https://img.alicdn.com/product.jpg",
  source_host: "img.alicdn.com",
  source_url_hash: "a".repeat(64),
  match_confidence: 0.98,
  match_evidence: { method: "manual" },
  verification_method: "manual",
  verified_at: "2026-09-12T00:00:00.000Z",
  verified_by: "reviewer",
  rejection_reason: null,
  unavailable_reason: null,
  content_hash: null,
  storage_bucket: null,
  storage_object_path: null,
  first_seen_at: "2026-09-12T00:00:00.000Z",
  last_seen_at: "2026-09-12T00:00:00.000Z",
  status_changed_at: "2026-09-12T00:00:00.000Z",
  created_at: "2026-09-12T00:00:00.000Z",
  updated_at: "2026-09-12T00:00:00.000Z",
};

describe("product image row mapper", () => {
  it("maps an approved product image without exposing database naming", () => {
    expect(mapProductImageRow(row)).toMatchObject({
      id: "image-1",
      productId: "product-1",
      variantId: null,
      targetType: "product",
      role: "primary",
      status: "approved",
      sourceUrl: "https://img.alicdn.com/product.jpg",
      verifiedAt: "2026-09-12T00:00:00.000Z",
    });
  });

  it("rejects a row whose target and variant relationship is inconsistent", () => {
    expect(mapProductImageRow({ ...row, target_type: "variant", variant_id: null })).toBeNull();
  });

  it("rejects a primary row that is not approved", () => {
    expect(mapProductImageRow({ ...row, status: "candidate" })).toBeNull();
  });
});
