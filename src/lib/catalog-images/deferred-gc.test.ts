import { describe, expect, it } from "vitest";

import { analyzeDeferredCatalogImageGc, CATALOG_IMAGE_GC_RETENTION_MS } from "./deferred-gc";

const now = new Date("2026-09-15T00:00:00.000Z");
const hash = "a".repeat(64);
const path = `products/product-1/image-1/${hash}.jpg`;
const object = { bucket: "catalog-images", path, createdAt: "2026-08-15T23:59:59.999Z" };

function analyze(overrides: Partial<Parameters<typeof analyzeDeferredCatalogImageGc>[0]> = {}) {
  return analyzeDeferredCatalogImageGc({
    objects: [object], imageReferences: [], primaryImageIds: [], eventImageIds: [], activeJobs: [],
    now, retentionMs: CATALOG_IMAGE_GC_RETENTION_MS, ...overrides,
  });
}

describe("deferred Catalog image GC analyzer", () => {
  it("returns an old, unreferenced object as a redacted GC candidate", () => {
    expect(analyze()).toEqual([{ bucket: "catalog-images", objectRef: "im•••-1", ageDays: 30 }]);
    expect(analyze()[0]).not.toHaveProperty("path");
  });

  it("protects any product_images reference regardless of image lifecycle status", () => {
    for (const status of ["approved", "rejected", "unavailable"] as const) {
      expect(analyze({ imageReferences: [{ imageId: "image-1", bucket: "catalog-images", path, status, isPrimary: false }] })).toEqual([]);
    }
  });

  it("protects active primary, rollback event, and active mirror job references", () => {
    expect(analyze({ primaryImageIds: ["image-1"] })).toEqual([]);
    expect(analyze({ eventImageIds: ["image-1"] })).toEqual([]);
    for (const status of ["pending", "processing", "retry_wait"] as const) {
      expect(analyze({ activeJobs: [{ imageId: "image-1", status }] })).toEqual([]);
    }
  });

  it("does not protect terminal jobs but enforces the full retention period", () => {
    expect(analyze({ activeJobs: [{ imageId: "image-1", status: "succeeded" }] })).toHaveLength(1);
    expect(analyze({ objects: [{ ...object, createdAt: "2026-08-16T00:00:00.001Z" }] })).toEqual([]);
  });

  it("ignores invalid buckets and paths", () => {
    expect(analyze({ objects: [{ ...object, bucket: "other" }] })).toEqual([]);
    expect(analyze({ objects: [{ ...object, path: "../outside.jpg" }] })).toEqual([]);
  });
});
