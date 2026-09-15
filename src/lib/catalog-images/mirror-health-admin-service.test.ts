import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { executeCatalogImageMirrorHealthAdminOperation } from "./mirror-health-admin-service";

describe("Catalog mirror health admin operation", () => {
  it("rejects unauthorized or cross-origin checks", async () => {
    const check = vi.fn();
    await expect(executeCatalogImageMirrorHealthAdminOperation({
      authorized: false, sameOrigin: true, imageId: "image-1", mode: "shallow",
    }, { check })).rejects.toThrow("Catalog image mirror health operation is unavailable.");
    await expect(executeCatalogImageMirrorHealthAdminOperation({
      authorized: true, sameOrigin: false, imageId: "image-1", mode: "shallow",
    }, { check })).rejects.toThrow("Catalog image mirror health operation is unavailable.");
    expect(check).not.toHaveBeenCalled();
  });

  it("allows a bounded shallow or deep check and updates last_checked_at", async () => {
    const check = vi.fn().mockResolvedValue({ status: "healthy" });
    await executeCatalogImageMirrorHealthAdminOperation({
      authorized: true, sameOrigin: true, imageId: "image-1", mode: "deep",
    }, { check });
    expect(check).toHaveBeenCalledWith("image-1", { mode: "deep", updateLastCheckedAt: true });
  });
});
