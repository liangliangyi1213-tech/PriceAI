import "server-only";

import { getCatalogSyncWriteClient } from "@/lib/catalog-sync/write-client";
import type { ProductImagePrimaryEventRow, ProductImageRow } from "@/lib/supabase/database.types";

import { mapProductImageRow } from "./mapper";
import { CatalogImageRepositoryError } from "./repository";
import type { CatalogImage, CatalogImagePrimaryEvent } from "./types";

export type CatalogImageProductIdentity = Readonly<{ id: string; name: string; category: string }>;
export type CatalogImageVariantIdentity = Readonly<{ id: string; productId: string; label: string }>;

export type CatalogImageWorkbenchSource = Readonly<{
  candidates: CatalogImage[];
  primaries: CatalogImage[];
  events: CatalogImagePrimaryEvent[];
  products: CatalogImageProductIdentity[];
  variants: CatalogImageVariantIdentity[];
}>;

function mapPrimaryEvent(row: ProductImagePrimaryEventRow): CatalogImagePrimaryEvent {
  return {
    id: row.id,
    productId: row.product_id,
    variantId: row.variant_id,
    targetType: row.target_type,
    previousImageId: row.previous_image_id,
    newImageId: row.new_image_id,
    action: row.action,
    reason: row.reason,
    changedBy: row.changed_by,
    createdAt: row.created_at,
  };
}

function variantLabel(row: Record<string, unknown>): string {
  return [row.storage, row.color, row.region, row.condition]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .join(" / ");
}

export class SupabaseCatalogImageWorkbenchRepository {
  async load(): Promise<CatalogImageWorkbenchSource> {
    try {
      const client = getCatalogSyncWriteClient();
      const candidateResult = await client
        .from("product_images")
        .select("*")
        .eq("status", "candidate")
        .order("first_seen_at", { ascending: true });
      if (candidateResult.error) throw candidateResult.error;
      const candidates = ((candidateResult.data ?? []) as ProductImageRow[])
        .map(mapProductImageRow)
        .filter((image): image is CatalogImage => image?.status === "candidate");
      const productIds = [...new Set(candidates.map((image) => image.productId))];
      if (productIds.length === 0) return { candidates: [], primaries: [], events: [], products: [], variants: [] };

      const [productsResult, variantsResult, primariesResult, eventsResult] = await Promise.all([
        client.from("products").select("id, name, category").in("id", productIds),
        client.from("product_variants").select("id, product_id, storage, color, region, condition").in("product_id", productIds),
        client.from("product_images").select("*").eq("status", "approved").eq("role", "primary").eq("is_primary", true).in("product_id", productIds),
        client.from("product_image_primary_events").select("*").in("product_id", productIds).order("created_at", { ascending: false }),
      ]);
      if (productsResult.error || variantsResult.error || primariesResult.error || eventsResult.error) {
        throw productsResult.error || variantsResult.error || primariesResult.error || eventsResult.error;
      }
      const products = ((productsResult.data ?? []) as Array<Record<string, unknown>>).flatMap((row) =>
        typeof row.id === "string" && typeof row.name === "string" && typeof row.category === "string"
          ? [{ id: row.id, name: row.name, category: row.category }]
          : [],
      );
      const variants = ((variantsResult.data ?? []) as Array<Record<string, unknown>>).flatMap((row) =>
        typeof row.id === "string" && typeof row.product_id === "string"
          ? [{ id: row.id, productId: row.product_id, label: variantLabel(row) || "具体 Variant" }]
          : [],
      );
      const primaries = ((primariesResult.data ?? []) as ProductImageRow[])
        .map(mapProductImageRow)
        .filter((image): image is CatalogImage => image?.status === "approved" && image.role === "primary");
      const events = ((eventsResult.data ?? []) as ProductImagePrimaryEventRow[]).map(mapPrimaryEvent);
      return { candidates, primaries, events, products, variants };
    } catch (error) {
      if (error instanceof CatalogImageRepositoryError) throw error;
      throw new CatalogImageRepositoryError();
    }
  }
}
