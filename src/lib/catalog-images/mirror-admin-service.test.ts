import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildCatalogImageMirrorAdminOverview, getCatalogImageMirrorAdminOverview } from "./mirror-admin-service";
import type { CatalogImage } from "./types";

function primary(): CatalogImage {
  return {
    id: "image-secret-id", productId: "product-1", variantId: null, targetType: "product",
    role: "primary", status: "approved", platform: "taobao", externalProductId: "external-secret",
    externalVariantId: null, sourceKind: "pict_url", sourceUrl: "https://img.alicdn.com/secret.jpg",
    sourceHost: "img.alicdn.com", sourceUrlHash: "a".repeat(64), matchConfidence: 1,
    matchEvidence: { raw: "secret" }, contentHash: null, storageBucket: null,
    storageObjectPath: null, contentType: null, width: null, height: null, mirroredAt: null,
    lastCheckedAt: null, verifiedAt: "2026-09-01T00:00:00.000Z", verifiedBy: "admin",
    verificationMethod: "manual", firstSeenAt: "2026-09-01T00:00:00.000Z",
    lastSeenAt: "2026-09-01T00:00:00.000Z",
  };
}

const source = {
  images: [{ image: primary(), category: "phone", productName: "示例商品", variantLabel: null }],
  jobs: [{
    id: "job-secret", imageId: "image-secret-id", primaryEventId: "event-secret",
    status: "processing" as const, attemptCount: 4, nextAttemptAt: null, lastErrorCode: null,
    policyVersion: 1, createdAt: "2026-09-01T00:00:00.000Z",
    startedAt: "2026-09-15T11:40:00.000Z", completedAt: null,
    updatedAt: "2026-09-15T11:40:00.000Z",
  }],
};

describe("Catalog image mirror admin overview", () => {
  it("returns a redacted ViewModel with job health flags", () => {
    const model = buildCatalogImageMirrorAdminOverview(source, [{
      imageId: "image-secret-id",
      health: { status: "remote_only", mirrored: false, bucket: null, lastCheckedAt: null },
    }], new Date("2026-09-15T12:00:00.000Z"));

    expect(model.items[0]).toMatchObject({
      productName: "示例商品", category: "手机", targetLabel: "Product-level", platform: "淘宝",
      healthStatus: "remote_only", mirrored: false,
      job: { status: "processing", attemptCount: 4, leaseExpired: true, retryDue: false, nearAttemptLimit: true },
    });
    const serialized = JSON.stringify(model);
    expect(serialized).not.toContain("alicdn");
    expect(serialized).not.toContain("external-secret");
    expect(serialized).not.toContain("event-secret");
    expect(serialized).not.toContain("job-secret");
    expect(serialized).not.toContain("raw");
  });

  it("loads database state once and performs health checks without repository N+1", async () => {
    const repository = { load: vi.fn().mockResolvedValue(source) };
    const health = { checkContext: vi.fn().mockResolvedValue({
      status: "remote_only", mirrored: false, bucket: null, lastCheckedAt: null,
    }) };
    await expect(getCatalogImageMirrorAdminOverview(repository, health, () => new Date("2026-09-15T12:00:00.000Z")))
      .resolves.toMatchObject({ items: [{ healthStatus: "remote_only" }] });
    expect(repository.load).toHaveBeenCalledTimes(1);
    expect(health.checkContext).toHaveBeenCalledTimes(1);
  });
});
