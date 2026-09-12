import type { ProductImageRow } from "@/lib/supabase/database.types";

import type { CatalogImage } from "./types";

export function mapProductImageRow(row: ProductImageRow): CatalogImage | null {
  const targetIsValid = row.target_type === "product"
    ? row.variant_id === null
    : row.variant_id !== null;
  const primaryIsValid = row.role === "primary"
    ? row.is_primary && row.status === "approved"
    : !row.is_primary;
  if (!targetIsValid || !primaryIsValid) return null;
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
    verifiedAt: row.verified_at,
  };
}
