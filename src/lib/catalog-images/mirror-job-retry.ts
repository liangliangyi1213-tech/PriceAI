import type { CatalogImageMirrorErrorCode } from "./mirror-service-types";

export const MIRROR_JOB_MAX_ATTEMPTS = 5;
export const MIRROR_JOB_BASE_DELAY_MS = 30_000;
export const MIRROR_JOB_MAX_DELAY_MS = 6 * 60 * 60 * 1000;
export const MIRROR_JOB_PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

const retryableCodes = new Set<CatalogImageMirrorErrorCode>([
  "repository_unavailable",
  "timeout",
  "upstream_server_error",
  "upload_failed",
  "metadata_update_failed",
]);

export function isRetryableMirrorError(code: CatalogImageMirrorErrorCode): boolean {
  return retryableCodes.has(code);
}

export function calculateMirrorRetryDelayMs(
  attemptCount: number,
  randomValue: number = Math.random(),
): number {
  const attempt = Math.max(1, Math.floor(attemptCount));
  const exponential = Math.min(MIRROR_JOB_MAX_DELAY_MS, MIRROR_JOB_BASE_DELAY_MS * (2 ** (attempt - 1)));
  const boundedRandom = Math.min(1, Math.max(0, randomValue));
  const jitterFactor = 0.8 + (boundedRandom * 0.4);
  return Math.min(MIRROR_JOB_MAX_DELAY_MS, Math.round(exponential * jitterFactor));
}
