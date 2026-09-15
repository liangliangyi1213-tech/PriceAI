import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { analyzeCatalogImageGcCandidates } from "./deferred-gc-service";

describe("server-only deferred GC analysis", () => {
  it("loads one inventory snapshot and returns only redacted candidates", async () => {
    const hash = "a".repeat(64);
    const repository = { load: vi.fn().mockResolvedValue({
      objects: [{
        bucket: "catalog-images", path: `products/product-1/image-1/${hash}.jpg`,
        createdAt: "2026-08-01T00:00:00.000Z",
      }],
      imageReferences: [], primaryImageIds: [], eventImageIds: [], activeJobs: [],
    }) };
    const result = await analyzeCatalogImageGcCandidates(repository, () => new Date("2026-09-15T00:00:00.000Z"));
    expect(repository.load).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ bucket: "catalog-images", objectRef: "im•••-1", ageDays: 45 }]);
    expect(JSON.stringify(result)).not.toContain("products/");
  });
});
