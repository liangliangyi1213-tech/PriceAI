import "server-only";

import { createHash } from "node:crypto";

import { getCatalogSyncWriteClient } from "@/lib/catalog-sync/write-client";
import type { ProductImageRow } from "@/lib/supabase/database.types";

import { mapProductImageRow } from "./mapper";
import {
  classifyRejectedSourceSuppression,
  type CatalogImageRejectedSourceSuppression,
  type RejectedSourceLifecycleRecord,
} from "./rejected-source-suppression";
import type {
  AppendPrimaryImageEvent,
  CatalogImage,
  CreateCatalogImageCandidate,
  CreateCatalogImageCandidateResult,
} from "./types";
import type {
  ApprovedCandidateInput,
  CatalogImageReviewContext,
  PrimaryPromotionResult,
  PromotePrimaryInput,
} from "./review-service";

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
  async getRejectedSourceSuppression(
    input: CreateCatalogImageCandidate,
    now = new Date(),
  ): Promise<CatalogImageRejectedSourceSuppression | null> {
    const row = candidateRow(input);
    try {
      let query = getCatalogSyncWriteClient()
        .from("product_images")
        .select("status, rejection_reason, status_changed_at")
        .eq("status", "rejected")
        .eq("product_id", row.product_id)
        .eq("target_type", row.target_type)
        .eq("platform", row.platform)
        .eq("external_product_id", row.external_product_id)
        .eq("source_url_hash", row.source_url_hash);
      query = row.variant_id === null
        ? query.is("variant_id", null)
        : query.eq("variant_id", row.variant_id);
      query = row.external_variant_id === null
        ? query.is("external_variant_id", null)
        : query.eq("external_variant_id", row.external_variant_id);
      const { data, error } = await query.limit(100);
      if (error) throw error;
      const records = (data ?? []).flatMap((record): RejectedSourceLifecycleRecord[] => {
        if (!record || typeof record !== "object") return [];
        const value = record as Record<string, unknown>;
        if (typeof value.status !== "string" || typeof value.status_changed_at !== "string"
          || (value.rejection_reason !== null && typeof value.rejection_reason !== "string")) return [];
        if (!["candidate", "approved", "rejected", "unavailable"].includes(value.status)) return [];
        return [{
          status: value.status as RejectedSourceLifecycleRecord["status"],
          rejectionReason: value.rejection_reason as string | null,
          statusChangedAt: value.status_changed_at,
        }];
      });
      return classifyRejectedSourceSuppression(records, now);
    } catch (error) {
      if (error instanceof CatalogImageRepositoryError) throw error;
      throw new CatalogImageRepositoryError();
    }
  }

  async getActiveCandidates(productId: string, platform: string): Promise<CatalogImage[]> {
    const normalizedProductId = productId.trim();
    const normalizedPlatform = platform.trim();
    if (!normalizedProductId || !normalizedPlatform) throw new CatalogImageRepositoryError();
    try {
      const { data, error } = await getCatalogSyncWriteClient()
        .from("product_images")
        .select("*")
        .eq("product_id", normalizedProductId)
        .eq("platform", normalizedPlatform)
        .eq("status", "candidate");
      if (error) throw error;
      return ((data ?? []) as ProductImageRow[])
        .map(mapProductImageRow)
        .filter((image): image is CatalogImage => image !== null && image.status === "candidate");
    } catch (error) {
      if (error instanceof CatalogImageRepositoryError) throw error;
      throw new CatalogImageRepositoryError();
    }
  }

  async countActiveCandidates(productId: string, platform: string): Promise<number> {
    const normalizedProductId = productId.trim();
    const normalizedPlatform = platform.trim();
    if (!normalizedProductId || !normalizedPlatform) throw new CatalogImageRepositoryError();
    try {
      const { count, error } = await getCatalogSyncWriteClient()
        .from("product_images")
        .select("id", { count: "exact", head: true })
        .eq("product_id", normalizedProductId)
        .eq("platform", normalizedPlatform)
        .eq("status", "candidate");
      if (error || count === null) throw error ?? new CatalogImageRepositoryError();
      return count;
    } catch (error) {
      if (error instanceof CatalogImageRepositoryError) throw error;
      throw new CatalogImageRepositoryError();
    }
  }

  async getApprovedPrimaries(productId: string): Promise<CatalogImage[]> {
    return this.getApprovedPrimariesForProducts([productId]);
  }

  async getApprovedPrimariesForProducts(productIds: readonly string[]): Promise<CatalogImage[]> {
    const ids = [...new Set(productIds.map((productId) => productId.trim()).filter(Boolean))];
    if (ids.length === 0) return [];
    try {
      const { data, error } = await getCatalogSyncWriteClient()
        .from("product_images")
        .select("*")
        .eq("status", "approved")
        .eq("role", "primary")
        .eq("is_primary", true)
        .in("product_id", ids);
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

  async getReviewContext(imageId: string): Promise<CatalogImageReviewContext | null> {
    try {
      const client = getCatalogSyncWriteClient();
      const { data, error } = await client
        .from("product_images")
        .select("*")
        .eq("id", imageId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const image = mapProductImageRow(data as ProductImageRow);
      if (!image) throw new CatalogImageRepositoryError();

      const { data: product, error: productError } = await client
        .from("products")
        .select("id")
        .eq("id", image.productId)
        .maybeSingle();
      if (productError) throw productError;

      let variantBelongsToProduct = image.targetType === "product";
      if (image.targetType === "variant" && image.variantId) {
        const { data: variant, error: variantError } = await client
          .from("product_variants")
          .select("id, product_id")
          .eq("id", image.variantId)
          .eq("product_id", image.productId)
          .maybeSingle();
        if (variantError) throw variantError;
        variantBelongsToProduct = Boolean(variant);
      }

      return {
        image,
        productExists: Boolean(product),
        variantBelongsToProduct,
      };
    } catch (error) {
      if (error instanceof CatalogImageRepositoryError) throw error;
      throw new CatalogImageRepositoryError();
    }
  }

  async approveCandidate(input: ApprovedCandidateInput): Promise<CatalogImage> {
    try {
      const { data, error } = await getCatalogSyncWriteClient()
        .from("product_images")
        .update({
          status: "approved",
          verified_at: input.verifiedAt,
          verified_by: input.reviewer,
          verification_method: input.reviewMethod,
          match_confidence: input.matchConfidence,
          match_evidence: input.matchEvidence,
          rejection_reason: null,
          unavailable_reason: null,
        })
        .eq("id", input.imageId)
        .eq("status", "candidate")
        .select("*")
        .maybeSingle();
      if (error || !data) throw error ?? new CatalogImageRepositoryError();
      const image = mapProductImageRow(data as ProductImageRow);
      if (!image || image.status !== "approved") throw new CatalogImageRepositoryError();
      return image;
    } catch (error) {
      if (error instanceof CatalogImageRepositoryError) throw error;
      throw new CatalogImageRepositoryError();
    }
  }

  async rejectCandidate(input: { imageId: string; reason: string }): Promise<boolean> {
    try {
      const { data, error } = await getCatalogSyncWriteClient()
        .from("product_images")
        .update({ status: "rejected", rejection_reason: input.reason })
        .eq("id", input.imageId)
        .eq("status", "candidate")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    } catch (error) {
      if (error instanceof CatalogImageRepositoryError) throw error;
      throw new CatalogImageRepositoryError();
    }
  }

  async promotePrimary(input: PromotePrimaryInput): Promise<PrimaryPromotionResult> {
    try {
      const { data, error } = await getCatalogSyncWriteClient().rpc(
        "promote_product_image_primary",
        {
          p_image_id: input.imageId,
          p_action: input.action,
          p_reason: input.reason,
          p_changed_by: input.reviewer,
        },
      );
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row !== "object") throw new CatalogImageRepositoryError();
      const result = row as Record<string, unknown>;
      if (typeof result.promoted_image_id !== "string"
        || (result.replaced_image_id !== null && typeof result.replaced_image_id !== "string")
        || result.promotion_action !== input.action
        || typeof result.primary_event_id !== "string") {
        throw new CatalogImageRepositoryError();
      }
      return {
        imageId: result.promoted_image_id,
        previousImageId: result.replaced_image_id as string | null,
        action: input.action,
        eventId: result.primary_event_id,
      };
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
