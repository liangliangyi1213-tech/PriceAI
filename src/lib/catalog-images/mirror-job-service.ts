import "server-only";

import {
  defaultMirrorPolicyRegistry,
  evaluateCatalogImageMirrorEligibility,
  type MirrorPolicyRegistry,
} from "./mirror-policy";
import { mirrorCatalogImage } from "./mirror-service";
import { CatalogImageMirrorError, type CatalogImageMirrorErrorCode } from "./mirror-service-types";
import { SupabaseCatalogImageRepository } from "./repository";
import {
  MIRROR_JOB_MAX_ATTEMPTS,
  MIRROR_JOB_PROCESSING_TIMEOUT_MS,
  calculateMirrorRetryDelayMs,
  isRetryableMirrorError,
} from "./mirror-job-retry";
import {
  SupabaseCatalogImageMirrorJobRepository,
  type CatalogImageMirrorJobRepository,
} from "./mirror-job-repository";
import type {
  CatalogImageMirrorEnqueueResult,
  CatalogImageMirrorJobErrorCode,
  CatalogImageMirrorRunResult,
} from "./mirror-job-types";
import type { PrimaryPromotionResult } from "./review-service";
import type { CatalogImageMirrorContext } from "./mirror-service-types";

export type CatalogMirrorContextRepository = Readonly<{
  getMirrorContext(imageId: string): Promise<CatalogImageMirrorContext | null>;
}>;

type EnqueueDependencies = Readonly<{
  jobs: CatalogImageMirrorJobRepository;
  catalog: CatalogMirrorContextRepository;
  registry: MirrorPolicyRegistry;
}>;

function eligibilityFor(context: CatalogImageMirrorContext, registry: MirrorPolicyRegistry) {
  return evaluateCatalogImageMirrorEligibility({
    image: {
      kind: "catalog_image",
      productId: context.image.productId,
      variantId: context.image.variantId,
      targetType: context.image.targetType,
      status: context.image.status,
      role: context.image.role,
      isPrimary: context.image.role === "primary",
      platform: context.image.platform,
      sourceUrl: context.image.sourceUrl,
    },
    category: context.category,
  }, registry);
}

function eventMatchesContext(
  event: NonNullable<Awaited<ReturnType<CatalogImageMirrorJobRepository["getPrimaryEvent"]>>>,
  context: CatalogImageMirrorContext,
): boolean {
  return context.variantBelongsToProduct
    && event.newImageId === context.image.id
    && event.productId === context.image.productId
    && event.variantId === context.image.variantId
    && event.targetType === context.image.targetType;
}

export async function enqueueCatalogImageMirrorJob(
  promotion: PrimaryPromotionResult,
  dependencies: EnqueueDependencies = {
    jobs: new SupabaseCatalogImageMirrorJobRepository(),
    catalog: new SupabaseCatalogImageRepository(),
    registry: defaultMirrorPolicyRegistry,
  },
): Promise<CatalogImageMirrorEnqueueResult> {
  const event = await dependencies.jobs.getPrimaryEvent(promotion.eventId);
  const context = await dependencies.catalog.getMirrorContext(promotion.imageId);
  if (!event || !context || !eventMatchesContext(event, context)) {
    return { status: "skipped", reason: "target_mismatch" };
  }
  const eligibility = eligibilityFor(context, dependencies.registry);
  if (!eligibility.eligible) {
    const reason = eligibility.reason === "eligible" || eligibility.reason === "not_catalog_image"
      ? "invalid_source"
      : eligibility.reason;
    return { status: "skipped", reason };
  }
  const result = await dependencies.jobs.enqueue({
    imageId: promotion.imageId,
    primaryEventId: promotion.eventId,
    policyVersion: eligibility.policy.policyVersion,
  });
  return { status: result.created ? "enqueued" : "existing", job: result.job };
}

type RunnerDependencies = EnqueueDependencies & Readonly<{
  mirror: (imageId: string) => Promise<unknown>;
  now: () => Date;
  random: () => number;
  maxAttempts: number;
  processingTimeoutMs: number;
}>;

function stableMirrorError(error: unknown): CatalogImageMirrorErrorCode {
  return error instanceof CatalogImageMirrorError ? error.code : "download_failed";
}

export async function runNextCatalogImageMirrorJob(
  dependencies: RunnerDependencies = {
    jobs: new SupabaseCatalogImageMirrorJobRepository(),
    catalog: new SupabaseCatalogImageRepository(),
    registry: defaultMirrorPolicyRegistry,
    mirror: mirrorCatalogImage,
    now: () => new Date(),
    random: Math.random,
    maxAttempts: MIRROR_JOB_MAX_ATTEMPTS,
    processingTimeoutMs: MIRROR_JOB_PROCESSING_TIMEOUT_MS,
  },
): Promise<CatalogImageMirrorRunResult> {
  const now = dependencies.now();
  const job = await dependencies.jobs.claimNext({
    now: now.toISOString(),
    processingTimeoutMs: dependencies.processingTimeoutMs,
    maxAttempts: dependencies.maxAttempts,
  });
  if (!job) return { status: "idle" };

  const settleFailure = async (code: CatalogImageMirrorErrorCode): Promise<CatalogImageMirrorRunResult> => {
    if (isRetryableMirrorError(code) && job.attemptCount < dependencies.maxAttempts) {
      const delay = calculateMirrorRetryDelayMs(job.attemptCount, dependencies.random());
      const nextAttemptAt = new Date(now.getTime() + delay).toISOString();
      await dependencies.jobs.markRetryWaiting(job.id, code, nextAttemptAt);
      return { status: "retry_wait", jobId: job.id };
    }
    await dependencies.jobs.markPermanentlyFailed(job.id, code, now.toISOString());
    return { status: "permanently_failed", jobId: job.id };
  };

  let event;
  let context;
  try {
    [event, context] = await Promise.all([
      dependencies.jobs.getPrimaryEvent(job.primaryEventId),
      dependencies.catalog.getMirrorContext(job.imageId),
    ]);
  } catch {
    return settleFailure("repository_unavailable");
  }
  if (!event || !context || !eventMatchesContext(event, context)) {
    await dependencies.jobs.markCancelled(job.id, "primary_context_changed", now.toISOString());
    return { status: "cancelled", jobId: job.id };
  }
  const eligibility = eligibilityFor(context, dependencies.registry);
  if (!eligibility.eligible) {
    const reason: CatalogImageMirrorJobErrorCode = eligibility.reason === "eligible"
      || eligibility.reason === "not_catalog_image"
      ? "invalid_source"
      : eligibility.reason;
    if (reason === "invalid_source") {
      await dependencies.jobs.markPermanentlyFailed(job.id, reason, now.toISOString());
      return { status: "permanently_failed", jobId: job.id };
    }
    await dependencies.jobs.markCancelled(job.id, reason, now.toISOString());
    return { status: "cancelled", jobId: job.id };
  }
  try {
    await dependencies.mirror(job.imageId);
    await dependencies.jobs.markSucceeded(job.id, now.toISOString());
    return { status: "succeeded", jobId: job.id };
  } catch (error) {
    return settleFailure(stableMirrorError(error));
  }
}
