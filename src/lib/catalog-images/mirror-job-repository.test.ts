import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getCatalogSyncWriteClient: vi.fn() }));
vi.mock("@/lib/catalog-sync/write-client", () => ({
  getCatalogSyncWriteClient: mocks.getCatalogSyncWriteClient,
}));

import { SupabaseCatalogImageMirrorJobRepository } from "./mirror-job-repository";
import type { ProductImageMirrorJobRow } from "@/lib/supabase/database.types";

const row: ProductImageMirrorJobRow = {
  id: "job-1", image_id: "image-1", primary_event_id: "event-1", status: "pending",
  attempt_count: 0, next_attempt_at: null, last_error_code: null, policy_version: 7,
  created_at: "2026-09-15T00:00:00.000Z", started_at: null, completed_at: null,
  updated_at: "2026-09-15T00:00:00.000Z",
};

describe("Supabase mirror job repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates one job for a primary event", async () => {
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ insert })) });
    await expect(new SupabaseCatalogImageMirrorJobRepository().enqueue({
      imageId: "image-1", primaryEventId: "event-1", policyVersion: 7,
    })).resolves.toMatchObject({ created: true, job: { id: "job-1", primaryEventId: "event-1" } });
  });

  it("returns the existing job after a unique conflict", async () => {
    const insertSingle = vi.fn().mockResolvedValue({ data: null, error: { code: "23505" } });
    const lookupSingle = vi.fn().mockResolvedValue({ data: { ...row, status: "succeeded" }, error: null });
    const from = vi.fn(() => ({
      insert: vi.fn(() => ({ select: vi.fn(() => ({ single: insertSingle })) })),
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: lookupSingle })) })),
    }));
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from });
    await expect(new SupabaseCatalogImageMirrorJobRepository().enqueue({
      imageId: "image-1", primaryEventId: "event-1", policyVersion: 7,
    })).resolves.toMatchObject({ created: false, job: { status: "succeeded" } });
  });

  it("uses the atomic claim RPC with a bounded processing lease", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ ...row, status: "processing", attempt_count: 1 }], error: null });
    mocks.getCatalogSyncWriteClient.mockReturnValue({ rpc });
    await expect(new SupabaseCatalogImageMirrorJobRepository().claimNext({
      now: "2026-09-15T00:05:00.000Z", processingTimeoutMs: 600_000, maxAttempts: 5,
    })).resolves.toMatchObject({ status: "processing", attemptCount: 1 });
    expect(rpc).toHaveBeenCalledWith("claim_product_image_mirror_job", {
      p_now: "2026-09-15T00:05:00.000Z", p_processing_timeout: "600 seconds", p_max_attempts: 5,
    });
  });

  it("guards terminal transitions with processing status", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "job-1" }, error: null });
    const eqStatus = vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle })) }));
    const eqId = vi.fn(() => ({ eq: eqStatus }));
    const update = vi.fn(() => ({ eq: eqId }));
    mocks.getCatalogSyncWriteClient.mockReturnValue({ from: vi.fn(() => ({ update })) });
    await new SupabaseCatalogImageMirrorJobRepository().markSucceeded("job-1", "2026-09-15T00:05:00.000Z");
    expect(eqId).toHaveBeenCalledWith("id", "job-1");
    expect(eqStatus).toHaveBeenCalledWith("status", "processing");
  });
});
