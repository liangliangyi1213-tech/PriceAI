import { describe, expect, it } from "vitest";

import {
  MIRROR_JOB_MAX_DELAY_MS,
  calculateMirrorRetryDelayMs,
  isRetryableMirrorError,
} from "./mirror-job-retry";

describe("Catalog image mirror retry policy", () => {
  it.each(["timeout", "upstream_server_error", "upload_failed", "metadata_update_failed", "repository_unavailable"] as const)(
    "retries the recoverable %s error",
    (code) => expect(isRetryableMirrorError(code)).toBe(true),
  );

  it.each(["policy_remote_only", "download_failed", "invalid_source", "dns_blocked", "redirect_blocked", "response_too_large", "unsupported_mime", "magic_mismatch", "invalid_dimensions", "pixel_limit_exceeded", "image_not_found", "target_mismatch"] as const)(
    "does not retry the permanent %s error",
    (code) => expect(isRetryableMirrorError(code)).toBe(false),
  );

  it("uses capped exponential backoff with bounded jitter", () => {
    expect(calculateMirrorRetryDelayMs(1, 0.5)).toBe(30_000);
    expect(calculateMirrorRetryDelayMs(2, 0.5)).toBe(60_000);
    expect(calculateMirrorRetryDelayMs(30, 0.5)).toBe(MIRROR_JOB_MAX_DELAY_MS);
    expect(calculateMirrorRetryDelayMs(30, 1)).toBe(MIRROR_JOB_MAX_DELAY_MS);
    expect(calculateMirrorRetryDelayMs(1, 0)).toBe(24_000);
    expect(calculateMirrorRetryDelayMs(1, 1)).toBe(36_000);
  });
});
