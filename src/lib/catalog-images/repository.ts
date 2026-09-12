import "server-only";

import { createHash } from "node:crypto";

import { getCatalogSyncWriteClient } from "@/lib/catalog-sync/write-client";
import type { ProductImageRow } from "@/lib/supabase/database.types";

import { mapProductImageRow } from "./mapper";
import type {
  AppendPrimaryImageEvent,
  CatalogImage,
  CreateCatalogImageCandidate,
  CreateCatalogImageCandidateResult,
} from "./types";

const allowedEvidenceMatchers = new Set([
  "taobao_phone_strict", "pinduoduo_phone_strict", "catalog_sync_deterministic",
]);
const allowedEvidenceSignals = new Set([
  "brand", "model", "category", "storage", "color", "region", "condition",
]);

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
  if (!input.productId.trim() || !input.platform.trim() || !input.externalProductId.trim()
    || !input.sourceKind.trim() || !Number.isFinite(input.matchConfidence)
    || input.matchConfidence < 0 || input.matchConfidence > 1
    || input.matchEvidence.matchLevel !== input.targetType
    || input.matchEvidence.schemaVersion !== 1
    || !allowedEvidenceMatchers.has(input.matchEvidence.matcher)
    || input.matchEvidence.signals.length === 0
    || input.matchEvidence.signals.some((signal) => !allowedEvidenceSignals.has(signal))) {
    throw new CatalogImageRepositoryError();
  }
  const sourceUrl = source.href;
  return {
    product_id: input.productId.trim(),
    variant_id: input.variantId,
    target_type: input.targetType,
    role: "gallery" as const,
    status: "candidate" as const,
    is_primary: false,
    platform: input.platform.trim(),
    external_product_id: input.externalProductId.trim(),
    external_variant_id: input.externalVariantId?.trim() || null,
    source_kind: input.sourceKind.trim(),
    source_url: sourceUrl,
    source_host: source.hostname.toLowerCase(),
    source_url_hash: createHash("sha256").update(sourceUrl).digest("hex"),
    match_confidence: input.matchConfidence,
    match_evidence: input.matchEvidence,
    verified_at: null,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "23505";
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

  async createCandidateIfAbsent(input: CreateCatalogImageCandidate): Promise<CreateCatalogImageCandidateResult> {
    const row = candidateRow(input);
    try {
      const client = getCatalogSyncWriteClient();
      const { data, error } = await client
        .from("product_images")
        .insert(row)
        .select("*")
        .single();
      if (error && !isUniqueViolation(error)) throw error;
      if (isUniqueViolation(error)) {
        let duplicateQuery = client
          .from("product_images")
          .select("*")
          .eq("platform", row.platform)
          .eq("external_product_id", row.external_product_id)
          .eq("source_url_hash", row.source_url_hash)
          .in("status", ["candidate", "approved"]);
        duplicateQuery = row.external_variant_id === null
          ? duplicateQuery.is("external_variant_id", null)
          : duplicateQuery.eq("external_variant_id", row.external_variant_id);
        const { data: existingData, error: lookupError } = await duplicateQuery.maybeSingle();
        if (lookupError) throw lookupError;
        const existing = existingData ? mapProductImageRow(existingData as ProductImageRow) : null;
        if (!existing || existing.productId !== row.product_id || existing.variantId !== row.variant_id
          || existing.targetType !== row.target_type) {
          throw new CatalogImageRepositoryError();
        }
        return { status: "duplicate", imageId: existing.id };
      }
      const image = mapProductImageRow(data as ProductImageRow);
      if (!image) throw new CatalogImageRepositoryError();
      return { status: "created", imageId: image.id };
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
