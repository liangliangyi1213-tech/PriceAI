import "server-only";

import { getCatalogSyncWriteClient } from "@/lib/catalog-sync/write-client";
import type {
  ProductImageMirrorJobRow,
  ProductImagePrimaryEventRow,
} from "@/lib/supabase/database.types";

import type { CatalogImagePrimaryEvent } from "./types";
import type {
  CatalogImageMirrorJob,
  CatalogImageMirrorJobErrorCode,
} from "./mirror-job-types";

export class CatalogImageMirrorJobRepositoryError extends Error {
  constructor() {
    super("Catalog image mirror job repository is unavailable.");
    this.name = "CatalogImageMirrorJobRepositoryError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "23505";
}

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

export type EnqueueMirrorJobInput = Readonly<{
  imageId: string;
  primaryEventId: string;
  policyVersion: number;
}>;

export interface CatalogImageMirrorJobRepository {
  getPrimaryEvent(eventId: string): Promise<CatalogImagePrimaryEvent | null>;
  enqueue(input: EnqueueMirrorJobInput): Promise<Readonly<{ created: boolean; job: CatalogImageMirrorJob }>>;
  claimNext(input: Readonly<{ now: string; processingTimeoutMs: number; maxAttempts: number }>): Promise<CatalogImageMirrorJob | null>;
  markSucceeded(jobId: string, completedAt: string): Promise<void>;
  markRetryWaiting(jobId: string, errorCode: CatalogImageMirrorJobErrorCode, nextAttemptAt: string): Promise<void>;
  markPermanentlyFailed(jobId: string, errorCode: CatalogImageMirrorJobErrorCode, completedAt: string): Promise<void>;
  markCancelled(jobId: string, errorCode: CatalogImageMirrorJobErrorCode, completedAt: string): Promise<void>;
}

export class SupabaseCatalogImageMirrorJobRepository implements CatalogImageMirrorJobRepository {
  async getPrimaryEvent(eventId: string): Promise<CatalogImagePrimaryEvent | null> {
    try {
      const { data, error } = await getCatalogSyncWriteClient()
        .from("product_image_primary_events")
        .select("*")
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapPrimaryEvent(data as ProductImagePrimaryEventRow) : null;
    } catch {
      throw new CatalogImageMirrorJobRepositoryError();
    }
  }

  async enqueue(input: EnqueueMirrorJobInput): Promise<Readonly<{ created: boolean; job: CatalogImageMirrorJob }>> {
    try {
      const client = getCatalogSyncWriteClient();
      const { data, error } = await client.from("product_image_mirror_jobs").insert({
        image_id: input.imageId,
        primary_event_id: input.primaryEventId,
        policy_version: input.policyVersion,
        status: "pending",
      }).select("*").single();
      if (!error && data) return { created: true, job: mapJob(data as ProductImageMirrorJobRow) };
      if (!isUniqueViolation(error)) throw error;
      const { data: existing, error: lookupError } = await client
        .from("product_image_mirror_jobs")
        .select("*")
        .eq("primary_event_id", input.primaryEventId)
        .single();
      if (lookupError || !existing) throw lookupError;
      return { created: false, job: mapJob(existing as ProductImageMirrorJobRow) };
    } catch {
      throw new CatalogImageMirrorJobRepositoryError();
    }
  }

  async claimNext(input: Readonly<{ now: string; processingTimeoutMs: number; maxAttempts: number }>): Promise<CatalogImageMirrorJob | null> {
    try {
      const seconds = Math.max(1, Math.ceil(input.processingTimeoutMs / 1000));
      const { data, error } = await getCatalogSyncWriteClient().rpc("claim_product_image_mirror_job", {
        p_now: input.now,
        p_processing_timeout: `${seconds} seconds`,
        p_max_attempts: input.maxAttempts,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ? mapJob(row as ProductImageMirrorJobRow) : null;
    } catch {
      throw new CatalogImageMirrorJobRepositoryError();
    }
  }

  private async transition(jobId: string, values: Record<string, unknown>): Promise<void> {
    try {
      const { data, error } = await getCatalogSyncWriteClient()
        .from("product_image_mirror_jobs")
        .update(values)
        .eq("id", jobId)
        .eq("status", "processing")
        .select("id")
        .maybeSingle();
      if (error || !data) throw error;
    } catch {
      throw new CatalogImageMirrorJobRepositoryError();
    }
  }

  markSucceeded(jobId: string, completedAt: string): Promise<void> {
    return this.transition(jobId, {
      status: "succeeded", completed_at: completedAt, updated_at: completedAt,
      next_attempt_at: null, last_error_code: null,
    });
  }

  markRetryWaiting(jobId: string, errorCode: CatalogImageMirrorJobErrorCode, nextAttemptAt: string): Promise<void> {
    return this.transition(jobId, {
      status: "retry_wait", next_attempt_at: nextAttemptAt, started_at: null,
      updated_at: new Date().toISOString(), last_error_code: errorCode,
    });
  }

  markPermanentlyFailed(jobId: string, errorCode: CatalogImageMirrorJobErrorCode, completedAt: string): Promise<void> {
    return this.transition(jobId, {
      status: "permanently_failed", completed_at: completedAt, updated_at: completedAt,
      next_attempt_at: null, last_error_code: errorCode,
    });
  }

  markCancelled(jobId: string, errorCode: CatalogImageMirrorJobErrorCode, completedAt: string): Promise<void> {
    return this.transition(jobId, {
      status: "cancelled", completed_at: completedAt, updated_at: completedAt,
      next_attempt_at: null, last_error_code: errorCode,
    });
  }
}
