import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./review-service", async (loadOriginal) => {
  const original = await loadOriginal<typeof import("./review-service")>();
  return { ...original, promoteCatalogImagePrimary: vi.fn() };
});

import { promoteCatalogImagePrimary } from "./review-service";
import { promoteCatalogImagePrimaryAndSchedule } from "./promotion-orchestration";

describe("primary promotion mirror scheduling", () => {
  it("enqueues only after promotion succeeds", async () => {
    vi.mocked(promoteCatalogImagePrimary).mockResolvedValue({
      imageId: "image-1", previousImageId: null, action: "initial", eventId: "event-1",
    });
    const enqueue = vi.fn().mockResolvedValue({ status: "skipped", reason: "policy_remote_only" });
    const repository = {} as Parameters<typeof promoteCatalogImagePrimaryAndSchedule>[1];
    await expect(promoteCatalogImagePrimaryAndSchedule({
      imageId: "image-1", action: "initial", reviewer: "admin", reason: "reviewed",
    }, repository, enqueue)).resolves.toMatchObject({
      eventId: "event-1", mirrorJob: { status: "skipped", reason: "policy_remote_only" },
    });
    expect(enqueue).toHaveBeenCalledAfter(vi.mocked(promoteCatalogImagePrimary));
  });

  it("does not roll back or disguise a committed promotion when enqueue fails", async () => {
    vi.mocked(promoteCatalogImagePrimary).mockResolvedValue({
      imageId: "image-1", previousImageId: "old", action: "replace", eventId: "event-2",
    });
    const enqueue = vi.fn().mockRejectedValue(new Error("repository unavailable"));
    const repository = {} as Parameters<typeof promoteCatalogImagePrimaryAndSchedule>[1];
    await expect(promoteCatalogImagePrimaryAndSchedule({
      imageId: "image-1", action: "replace", reviewer: "admin", reason: "reviewed",
    }, repository, enqueue)).resolves.toMatchObject({
      action: "replace", eventId: "event-2", mirrorJob: { status: "enqueue_failed" },
    });
  });
});
