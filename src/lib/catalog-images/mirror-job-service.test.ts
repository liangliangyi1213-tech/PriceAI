import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createMirrorPolicyRegistry, type MirrorPolicy } from "./mirror-policy";
import { CatalogImageMirrorError } from "./mirror-service-types";
import { enqueueCatalogImageMirrorJob, runNextCatalogImageMirrorJob } from "./mirror-job-service";
import type { CatalogImageMirrorJobRepository } from "./mirror-job-repository";
import type { CatalogImageMirrorJob } from "./mirror-job-types";
import type { CatalogImageMirrorContext } from "./mirror-service-types";
import type { CatalogImagePrimaryEvent } from "./types";

const policy: MirrorPolicy = {
  platform: "taobao", category: "phone", mode: "mirror_allowed",
  allowedMimeTypes: ["image/jpeg"], maxDownloadBytes: 4_000_000,
  maxDecodedPixels: 20_000_000, transform: "preserve", policyVersion: 7,
  authorizationBasis: "test-only",
};
const registry = createMirrorPolicyRegistry([policy]);

function context(): CatalogImageMirrorContext {
  return {
    category: "phone",
    variantBelongsToProduct: true,
    image: {
      id: "image-1", productId: "product-1", variantId: null, targetType: "product",
      role: "primary", status: "approved", platform: "taobao", externalProductId: "external-1",
      externalVariantId: null, sourceKind: "pict_url", sourceUrl: "https://img.alicdn.com/item.jpg",
      sourceHost: "img.alicdn.com", sourceUrlHash: "a".repeat(64), matchConfidence: 1,
      matchEvidence: { schemaVersion: 1 }, contentHash: null, storageBucket: null,
      storageObjectPath: null, contentType: null, width: null, height: null, mirroredAt: null,
      lastCheckedAt: null, verifiedAt: "2026-09-15T00:00:00.000Z", verifiedBy: "admin",
      verificationMethod: "manual", firstSeenAt: "2026-09-14T00:00:00.000Z",
      lastSeenAt: "2026-09-15T00:00:00.000Z",
    },
  };
}

function event(id = "event-1", action: CatalogImagePrimaryEvent["action"] = "initial"): CatalogImagePrimaryEvent {
  return {
    id, productId: "product-1", variantId: null, targetType: "product",
    previousImageId: null, newImageId: "image-1", action, reason: "reviewed",
    changedBy: "admin", createdAt: "2026-09-15T00:00:00.000Z",
  };
}

function job(overrides: Partial<CatalogImageMirrorJob> = {}): CatalogImageMirrorJob {
  return {
    id: "job-1", imageId: "image-1", primaryEventId: "event-1", status: "processing",
    attemptCount: 1, nextAttemptAt: null, lastErrorCode: null, policyVersion: 7,
    createdAt: "2026-09-15T00:00:00.000Z", startedAt: "2026-09-15T00:01:00.000Z",
    completedAt: null, updatedAt: "2026-09-15T00:01:00.000Z", ...overrides,
  };
}

describe("Catalog image mirror outbox service", () => {
  const jobs = {
    getPrimaryEvent: vi.fn(), enqueue: vi.fn(), claimNext: vi.fn(), markSucceeded: vi.fn(),
    markRetryWaiting: vi.fn(), markPermanentlyFailed: vi.fn(), markCancelled: vi.fn(),
  } satisfies CatalogImageMirrorJobRepository;
  const catalog = { getMirrorContext: vi.fn() };
  const mirror = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    jobs.getPrimaryEvent.mockResolvedValue(event());
    jobs.enqueue.mockResolvedValue({ created: true, job: job({ status: "pending", attemptCount: 0, startedAt: null }) });
    jobs.claimNext.mockResolvedValue(job());
    catalog.getMirrorContext.mockResolvedValue(context());
    mirror.mockResolvedValue({ status: "mirrored" });
  });

  it("does not enqueue a remote-only platform", async () => {
    const result = await enqueueCatalogImageMirrorJob(
      { imageId: "image-1", previousImageId: null, eventId: "event-1", action: "initial" },
      { jobs, catalog, registry: createMirrorPolicyRegistry([]) },
    );
    expect(result).toEqual({ status: "skipped", reason: "policy_remote_only" });
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });

  it("does not retry a missing record or changed target as repository downtime", async () => {
    jobs.getPrimaryEvent.mockResolvedValueOnce(null);
    await expect(runNextCatalogImageMirrorJob({
      jobs, catalog, registry, mirror, now: () => new Date("2026-09-15T00:02:00.000Z"),
      random: () => 0.5, maxAttempts: 5, processingTimeoutMs: 600_000,
    })).resolves.toEqual({ status: "cancelled", jobId: "job-1" });
    expect(jobs.markCancelled).toHaveBeenCalledWith("job-1", "primary_context_changed", expect.any(String));
    expect(jobs.markRetryWaiting).not.toHaveBeenCalled();

    vi.clearAllMocks();
    jobs.claimNext.mockResolvedValue(job());
    jobs.getPrimaryEvent.mockResolvedValue(event());
    catalog.getMirrorContext.mockResolvedValue({ ...context(), variantBelongsToProduct: false });
    await runNextCatalogImageMirrorJob({
      jobs, catalog, registry, mirror, now: () => new Date("2026-09-15T00:02:00.000Z"),
      random: () => 0.5, maxAttempts: 5, processingTimeoutMs: 600_000,
    });
    expect(jobs.markCancelled).toHaveBeenCalledWith("job-1", "primary_context_changed", expect.any(String));
    expect(jobs.markRetryWaiting).not.toHaveBeenCalled();
  });

  it("enqueues one eligible job and returns an existing job for a repeated event", async () => {
    await expect(enqueueCatalogImageMirrorJob(
      { imageId: "image-1", previousImageId: null, eventId: "event-1", action: "initial" },
      { jobs, catalog, registry },
    )).resolves.toMatchObject({ status: "enqueued" });
    expect(jobs.enqueue).toHaveBeenCalledWith({ imageId: "image-1", primaryEventId: "event-1", policyVersion: 7 });

    jobs.enqueue.mockResolvedValueOnce({ created: false, job: job({ status: "succeeded" }) });
    await expect(enqueueCatalogImageMirrorJob(
      { imageId: "image-1", previousImageId: null, eventId: "event-1", action: "initial" },
      { jobs, catalog, registry },
    )).resolves.toMatchObject({ status: "existing" });
  });

  it.each([["event-replace", "replace"], ["event-rollback", "rollback"]] as const)(
    "creates a distinct job for a new %s primary event",
    async (eventId, action) => {
      jobs.getPrimaryEvent.mockResolvedValueOnce(event(eventId, action));
      await enqueueCatalogImageMirrorJob(
        { imageId: "image-1", previousImageId: "old", eventId, action },
        { jobs, catalog, registry },
      );
      expect(jobs.enqueue).toHaveBeenCalledWith(expect.objectContaining({ primaryEventId: eventId }));
    },
  );

  it("claims and completes a mirror job", async () => {
    await expect(runNextCatalogImageMirrorJob({
      jobs, catalog, registry, mirror, now: () => new Date("2026-09-15T00:02:00.000Z"),
      random: () => 0.5, maxAttempts: 5, processingTimeoutMs: 600_000,
    })).resolves.toEqual({ status: "succeeded", jobId: "job-1" });
    expect(mirror).toHaveBeenCalledWith("image-1");
    expect(jobs.markSucceeded).toHaveBeenCalledWith("job-1", "2026-09-15T00:02:00.000Z");
  });

  it("moves a retryable failure to retry_wait with exponential backoff", async () => {
    mirror.mockRejectedValueOnce(new CatalogImageMirrorError("timeout"));
    await expect(runNextCatalogImageMirrorJob({
      jobs, catalog, registry, mirror, now: () => new Date("2026-09-15T00:02:00.000Z"),
      random: () => 0.5, maxAttempts: 5, processingTimeoutMs: 600_000,
    })).resolves.toEqual({ status: "retry_wait", jobId: "job-1" });
    expect(jobs.markRetryWaiting).toHaveBeenCalledWith("job-1", "timeout", "2026-09-15T00:02:30.000Z");
  });

  it("permanently fails non-retryable errors and exhausted retries", async () => {
    mirror.mockRejectedValueOnce(new CatalogImageMirrorError("magic_mismatch"));
    await runNextCatalogImageMirrorJob({
      jobs, catalog, registry, mirror, now: () => new Date("2026-09-15T00:02:00.000Z"),
      random: () => 0.5, maxAttempts: 5, processingTimeoutMs: 600_000,
    });
    expect(jobs.markPermanentlyFailed).toHaveBeenCalledWith("job-1", "magic_mismatch", expect.any(String));

    vi.clearAllMocks();
    jobs.claimNext.mockResolvedValue(job({ attemptCount: 5 }));
    jobs.getPrimaryEvent.mockResolvedValue(event());
    catalog.getMirrorContext.mockResolvedValue(context());
    mirror.mockRejectedValue(new CatalogImageMirrorError("upload_failed"));
    await runNextCatalogImageMirrorJob({
      jobs, catalog, registry, mirror, now: () => new Date("2026-09-15T00:02:00.000Z"),
      random: () => 0.5, maxAttempts: 5, processingTimeoutMs: 600_000,
    });
    expect(jobs.markRetryWaiting).not.toHaveBeenCalled();
    expect(jobs.markPermanentlyFailed).toHaveBeenCalledWith("job-1", "upload_failed", expect.any(String));
  });

  it("does not classify an unknown mirror failure as repository infrastructure downtime", async () => {
    mirror.mockRejectedValueOnce(new Error("unexpected implementation failure"));
    await expect(runNextCatalogImageMirrorJob({
      jobs, catalog, registry, mirror, now: () => new Date("2026-09-15T00:02:00.000Z"),
      random: () => 0.5, maxAttempts: 5, processingTimeoutMs: 600_000,
    })).resolves.toEqual({ status: "permanently_failed", jobId: "job-1" });
    expect(jobs.markPermanentlyFailed).toHaveBeenCalledWith("job-1", "download_failed", expect.any(String));
    expect(jobs.markRetryWaiting).not.toHaveBeenCalled();
  });

  it("cancels when policy changes to remote-only without calling the mirror service", async () => {
    await expect(runNextCatalogImageMirrorJob({
      jobs, catalog, registry: createMirrorPolicyRegistry([]), mirror,
      now: () => new Date("2026-09-15T00:02:00.000Z"), random: () => 0.5,
      maxAttempts: 5, processingTimeoutMs: 600_000,
    })).resolves.toEqual({ status: "cancelled", jobId: "job-1" });
    expect(jobs.markCancelled).toHaveBeenCalledWith("job-1", "policy_remote_only", expect.any(String));
    expect(mirror).not.toHaveBeenCalled();
  });

  it("cancels a stale primary event or changed image identity", async () => {
    jobs.getPrimaryEvent.mockResolvedValueOnce(event("event-1", "initial"));
    catalog.getMirrorContext.mockResolvedValueOnce({
      ...context(), image: { ...context().image, id: "image-changed" },
    });
    await runNextCatalogImageMirrorJob({
      jobs, catalog, registry, mirror, now: () => new Date("2026-09-15T00:02:00.000Z"),
      random: () => 0.5, maxAttempts: 5, processingTimeoutMs: 600_000,
    });
    expect(jobs.markCancelled).toHaveBeenCalledWith("job-1", "primary_context_changed", expect.any(String));
    expect(mirror).not.toHaveBeenCalled();
  });

  it("passes processing lease and max-attempt options to the atomic claim", async () => {
    jobs.claimNext.mockResolvedValueOnce(null);
    await expect(runNextCatalogImageMirrorJob({
      jobs, catalog, registry, mirror, now: () => new Date("2026-09-15T00:02:00.000Z"),
      random: () => 0.5, maxAttempts: 5, processingTimeoutMs: 600_000,
    })).resolves.toEqual({ status: "idle" });
    expect(jobs.claimNext).toHaveBeenCalledWith({
      now: "2026-09-15T00:02:00.000Z", processingTimeoutMs: 600_000, maxAttempts: 5,
    });
  });

  it("retries a transient context read failure without touching image review state", async () => {
    catalog.getMirrorContext.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(runNextCatalogImageMirrorJob({
      jobs, catalog, registry, mirror, now: () => new Date("2026-09-15T00:02:00.000Z"),
      random: () => 0.5, maxAttempts: 5, processingTimeoutMs: 600_000,
    })).resolves.toEqual({ status: "retry_wait", jobId: "job-1" });
    expect(jobs.markRetryWaiting).toHaveBeenCalledWith(
      "job-1", "repository_unavailable", "2026-09-15T00:02:30.000Z",
    );
    expect(mirror).not.toHaveBeenCalled();
  });
});
