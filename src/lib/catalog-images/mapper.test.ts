import { describe, expect, it } from "vitest";

import { isValidProductImageMirrorMetadata, mapProductImageRow } from "./mapper";
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
  content_type: null,
  width: null,
  height: null,
  mirrored_at: null,
  last_checked_at: null,
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

  it("accepts empty mirror metadata independently of approval state", () => {
    expect(isValidProductImageMirrorMetadata(row)).toBe(true);
    expect(mapProductImageRow(row)).toMatchObject({
      contentType: null,
      width: null,
      height: null,
      mirroredAt: null,
      lastCheckedAt: null,
    });
  });

  it.each([
    ["image/jpeg"],
    ["image/png"],
    ["image/webp"],
  ])("accepts supported mirror content type %s", (contentType) => {
    expect(isValidProductImageMirrorMetadata({
      ...row,
      content_type: contentType,
      width: 1200,
      height: 900,
    })).toBe(true);
  });

  it.each([
    ["image/svg+xml"],
    ["image/gif"],
    ["application/octet-stream"],
  ])("rejects unsupported mirror content type %s", (contentType) => {
    expect(isValidProductImageMirrorMetadata({ ...row, content_type: contentType })).toBe(false);
  });

  it("requires width and height together", () => {
    expect(isValidProductImageMirrorMetadata({ ...row, width: 1200 })).toBe(false);
    expect(isValidProductImageMirrorMetadata({ ...row, height: 900 })).toBe(false);
  });

  it.each([
    [0, 900],
    [-1, 900],
    [1200, 0],
    [1200, -1],
  ])("rejects non-positive dimensions %s x %s", (width, height) => {
    expect(isValidProductImageMirrorMetadata({ ...row, width, height })).toBe(false);
  });

  it("accepts last_checked_at equal to or after mirrored_at", () => {
    expect(isValidProductImageMirrorMetadata({
      ...row,
      mirrored_at: "2026-09-14T00:00:00.000Z",
      last_checked_at: "2026-09-14T00:00:00.000Z",
    })).toBe(true);
    expect(isValidProductImageMirrorMetadata({
      ...row,
      mirrored_at: "2026-09-14T00:00:00.000Z",
      last_checked_at: "2026-09-15T00:00:00.000Z",
    })).toBe(true);
  });

  it("rejects last_checked_at before mirrored_at", () => {
    expect(isValidProductImageMirrorMetadata({
      ...row,
      mirrored_at: "2026-09-14T00:00:00.000Z",
      last_checked_at: "2026-09-13T23:59:59.999Z",
    })).toBe(false);
  });

  it.each([
    ["approved", "primary", true],
    ["approved", "gallery", false],
    ["rejected", "gallery", false],
    ["unavailable", "gallery", false],
  ] as const)("keeps mirror metadata independent for %s %s", (status, role, isPrimary) => {
    const candidate = {
      ...row,
      status,
      role,
      is_primary: isPrimary,
      storage_bucket: "catalog-images",
      storage_object_path: "products/product-1/image-1.jpg",
      content_hash: "b".repeat(64),
      content_type: "image/jpeg",
      width: 1200,
      height: 900,
      mirrored_at: "2026-09-14T00:00:00.000Z",
      last_checked_at: "2026-09-14T00:00:00.000Z",
    } satisfies ProductImageRow;

    expect(isValidProductImageMirrorMetadata(candidate)).toBe(true);
    expect(mapProductImageRow(candidate)).not.toBeNull();
  });
});
