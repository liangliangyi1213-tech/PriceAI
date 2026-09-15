import "server-only";

import { getCatalogSyncWriteClient } from "@/lib/catalog-sync/write-client";
import type { ProductImageMirrorJobRow, ProductImageRow } from "@/lib/supabase/database.types";

import { mapProductImageRow } from "./mapper";
import type { CatalogImageMirrorAdminSource } from "./mirror-admin-service";
import type { CatalogImageMirrorJob, CatalogImageMirrorJobErrorCode } from "./mirror-job-types";
import { CatalogImageRepositoryError } from "./repository";
import type { CatalogImage } from "./types";

function mapJob(row: ProductImageMirrorJobRow): CatalogImageMirrorJob {
  return {
    id: row.id,
    imageId: row.image_id,
    primaryEventId: row.primary_event_id,
    status: row.status,
    attemptCount: row.attempt_count,
    nextAttemptAt: row.next_attempt_at,
    lastErrorCode: row.last_error_code as CatalogImageMirrorJobErrorCode | null,
    policyVersion: row.policy_version,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function variantLabel(row: Record<string, unknown>): string {
  return [row.storage, row.color, row.region, row.condition]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .join(" / ") || "具体 Variant";
}

export class SupabaseCatalogImageMirrorAdminRepository {
  async load(): Promise<CatalogImageMirrorAdminSource> {
    try {
      const client = getCatalogSyncWriteClient();
      const primaryResult = await client.from("product_images").select("*")
        .eq("status", "approved").eq("role", "primary").eq("is_primary", true);
      if (primaryResult.error) throw primaryResult.error;
      const primaries = ((primaryResult.data ?? []) as ProductImageRow[])
        .map(mapProductImageRow)
        .filter((image): image is CatalogImage => image?.status === "approved" && image.role === "primary");
      if (primaries.length === 0) return { images: [], jobs: [] };

      const productIds = [...new Set(primaries.map((image) => image.productId))];
      const imageIds = primaries.map((image) => image.id);
      const [productsResult, variantsResult, jobsResult] = await Promise.all([
        client.from("products").select("id, name, category").in("id", productIds),
        client.from("product_variants").select("id, product_id, storage, color, region, condition").in("product_id", productIds),
        client.from("product_image_mirror_jobs").select("*").in("image_id", imageIds).order("created_at", { ascending: false }),
      ]);
      if (productsResult.error || variantsResult.error || jobsResult.error) {
        throw productsResult.error || variantsResult.error || jobsResult.error;
      }
      const products = new Map(((productsResult.data ?? []) as Array<Record<string, unknown>>).flatMap((row) =>
        typeof row.id === "string" && typeof row.name === "string" && typeof row.category === "string"
          ? [[row.id, { name: row.name, category: row.category }] as const]
          : [],
      ));
      const variants = new Map(((variantsResult.data ?? []) as Array<Record<string, unknown>>).flatMap((row) =>
        typeof row.id === "string" && typeof row.product_id === "string"
          ? [[row.id, { productId: row.product_id, label: variantLabel(row) }] as const]
          : [],
      ));
      return {
        images: primaries.flatMap((image) => {
          const product = products.get(image.productId);
          const variant = image.variantId ? variants.get(image.variantId) : null;
          if (!product) return [];
          return [{
            image,
            productName: product.name,
            category: product.category,
            variantLabel: variant?.label ?? null,
            variantBelongsToProduct: image.targetType === "product"
              ? image.variantId === null
              : Boolean(variant && variant.productId === image.productId),
          }];
        }),
        jobs: ((jobsResult.data ?? []) as ProductImageMirrorJobRow[]).map(mapJob),
      };
    } catch (error) {
      if (error instanceof CatalogImageRepositoryError) throw error;
      throw new CatalogImageRepositoryError();
    }
  }
}
