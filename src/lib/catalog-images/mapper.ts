import type { ProductImageRow } from "@/lib/supabase/database.types";

import type { CatalogImage } from "./types";

const ALLOWED_MIRROR_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type ProductImageMirrorMetadata = Pick<
  ProductImageRow,
  "content_type" | "width" | "height" | "mirrored_at" | "last_checked_at"
>;

export function isValidProductImageMirrorMetadata(row: ProductImageMirrorMetadata): boolean {
  if (row.content_type !== null && !ALLOWED_MIRROR_CONTENT_TYPES.has(row.content_type)) {
    return false;
  }

  const hasWidth = row.width !== null;
  const hasHeight = row.height !== null;
  if (hasWidth !== hasHeight) return false;
  if (row.width !== null && row.height !== null && (row.width <= 0 || row.height <= 0)) {
    return false;
  }

  if (row.mirrored_at !== null && row.last_checked_at !== null) {
    const mirroredAt = Date.parse(row.mirrored_at);
    const lastCheckedAt = Date.parse(row.last_checked_at);
    if (!Number.isFinite(mirroredAt) || !Number.isFinite(lastCheckedAt) || lastCheckedAt < mirroredAt) {
      return false;
    }
  }

  return true;
}

export function mapProductImageRow(row: ProductImageRow): CatalogImage | null {
  const targetIsValid = row.target_type === "product"
    ? row.variant_id === null
    : row.variant_id !== null;
  const primaryIsValid = row.role === "primary"
    ? row.is_primary && row.status === "approved"
    : !row.is_primary;
  if (!targetIsValid || !primaryIsValid || !isValidProductImageMirrorMetadata(row)) return null;
  const matchEvidence = typeof row.match_evidence === "object" && row.match_evidence !== null
    && !Array.isArray(row.match_evidence)
    ? row.match_evidence as Record<string, unknown>
    : null;

  return {
    id: row.id,
    productId: row.product_id,
    variantId: row.variant_id,
    targetType: row.target_type,
    role: row.role,
    status: row.status,
    platform: row.platform,
    externalProductId: row.external_product_id,
    externalVariantId: row.external_variant_id,
    sourceKind: row.source_kind,
    sourceUrl: row.source_url,
    sourceHost: row.source_host,
    sourceUrlHash: row.source_url_hash,
    matchConfidence: row.match_confidence,
    matchEvidence,
    contentHash: row.content_hash,
    storageBucket: row.storage_bucket,
    storageObjectPath: row.storage_object_path,
    contentType: row.content_type as CatalogImage["contentType"],
    width: row.width,
    height: row.height,
    mirroredAt: row.mirrored_at,
    lastCheckedAt: row.last_checked_at,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    verificationMethod: row.verification_method,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}
