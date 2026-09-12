import "server-only";

import { createHash } from "node:crypto";

import { getCatalogSyncWriteClient } from "@/lib/catalog-sync/write-client";
import type { ProductImageRow } from "@/lib/supabase/database.types";

import { mapProductImageRow } from "./mapper";
import type {
  AppendPrimaryImageEvent,
  CatalogImage,
  CreateCatalogImageCandidate,
} from "./types";

export class CatalogImageRepositoryError extends Error {
  constructor() {
    super("Catalog image repository is unavailable.");
    this.name = "CatalogImageRepositoryError";
  }
}

function candidateRow(input: CreateCatalogImageCandidate) {
  let source: URL;
  try {
    source = new URL(input.sourceUrl);
  } catch {
    throw new CatalogImageRepositoryError();
  }
  if (source.protocol !== "https:" || source.username || source.password) {
    throw new CatalogImageRepositoryError();
  }
  if ((input.targetType === "product") !== (input.variantId === null)) {
    throw new CatalogImageRepositoryError();
  }
  const sourceUrl = source.href;
  return {
    product_id: input.productId,
    variant_id: input.variantId,
    target_type: input.targetType,
    role: "gallery" as const,
    status: "candidate" as const,
    is_primary: false,
    platform: input.platform,
    external_product_id: input.externalProductId,
    external_variant_id: input.externalVariantId,
    source_kind: input.sourceKind,
    source_url: sourceUrl,
    source_host: source.hostname.toLowerCase(),
    source_url_hash: createHash("sha256").update(sourceUrl).digest("hex"),
  };
}

export class SupabaseCatalogImageRepository {
  async getApprovedPrimaries(productId: string): Promise<CatalogImage[]> {
    try {
      const { data, error } = await getCatalogSyncWriteClient()
        .from("product_images")
        .select("*")
        .eq("status", "approved")
        .eq("role", "primary")
        .eq("product_id", productId);
      if (error) throw error;
      return ((data ?? []) as ProductImageRow[])
        .map(mapProductImageRow)
        .filter((image): image is CatalogImage => image !== null);
    } catch {
      throw new CatalogImageRepositoryError();
    }
  }

  async createCandidate(input: CreateCatalogImageCandidate): Promise<CatalogImage> {
    try {
      const { data, error } = await getCatalogSyncWriteClient()
        .from("product_images")
        .insert(candidateRow(input))
        .select("*")
        .single();
      if (error) throw error;
      const image = mapProductImageRow(data as ProductImageRow);
      if (!image) throw new CatalogImageRepositoryError();
      return image;
    } catch (error) {
      if (error instanceof CatalogImageRepositoryError) throw error;
      throw new CatalogImageRepositoryError();
    }
  }

  async appendPrimaryEvent(input: AppendPrimaryImageEvent): Promise<void> {
    try {
      const { error } = await getCatalogSyncWriteClient()
        .from("product_image_primary_events")
        .insert({
          product_id: input.productId,
          variant_id: input.variantId,
          target_type: input.targetType,
          previous_image_id: input.previousImageId,
          new_image_id: input.newImageId,
          action: input.action,
          reason: input.reason,
          changed_by: input.changedBy,
        });
      if (error) throw error;
    } catch {
      throw new CatalogImageRepositoryError();
    }
  }
}
