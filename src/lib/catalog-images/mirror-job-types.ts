import type { CatalogImageMirrorErrorCode } from "./mirror-service-types";

export type CatalogImageMirrorJobStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "retry_wait"
  | "permanently_failed"
  | "cancelled";

export type CatalogImageMirrorJobErrorCode = CatalogImageMirrorErrorCode
  | "primary_context_changed"
  | "processing_lease_expired";

export type CatalogImageMirrorJob = Readonly<{
  id: string;
  imageId: string;
  primaryEventId: string;
  status: CatalogImageMirrorJobStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  lastErrorCode: CatalogImageMirrorJobErrorCode | null;
  policyVersion: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}>;

export type CatalogImageMirrorEnqueueResult =
  | Readonly<{ status: "enqueued" | "existing"; job: CatalogImageMirrorJob }>
  | Readonly<{ status: "skipped"; reason: CatalogImageMirrorErrorCode }>;

export type CatalogImageMirrorRunResult =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "succeeded" | "retry_wait" | "permanently_failed" | "cancelled"; jobId: string }>;
