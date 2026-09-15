import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createMirrorPolicyRegistry, type MirrorPolicy } from "./mirror-policy";
import { createCatalogImageMirrorHealthService } from "./mirror-health";
import type { CatalogImage } from "./types";

const now = new Date("2026-09-15T12:00:00.000Z");
const bytes = new TextEncoder().encode("catalog-image-bytes");
const hash = createHash("sha256").update(bytes).digest("hex");
const path = `products/product-1/image-1/${hash}.jpg`;

const allowed: MirrorPolicy = {
  platform: "test-provider", category: "phones", mode: "mirror_allowed",
  allowedMimeTypes: ["image/jpeg"], maxDownloadBytes: 2_000_000,
  maxDecodedPixels: 12_000_000, transform: "preserve", policyVersion: 1,
};

function image(overrides: Partial<CatalogImage> = {}): CatalogImage {
  return {
    id: "image-1", productId: "product-1", variantId: null, targetType: "product",
    role: "primary", status: "approved", platform: "test-provider",
    externalProductId: "provider-item", externalVariantId: null, sourceKind: "primary",
    sourceUrl: "https://images.example.test/product.jpg", sourceHost: "images.example.test",
    sourceUrlHash: "a".repeat(64), matchConfidence: 1, matchEvidence: { schemaVersion: 1 },
    contentHash: hash, storageBucket: "catalog-images", storageObjectPath: path,
    contentType: "image/jpeg", width: 1200, height: 900,
    mirroredAt: "2026-09-14T12:00:00.000Z", lastCheckedAt: "2026-09-15T06:00:00.000Z",
    verifiedAt: "2026-09-14T00:00:00.000Z", verifiedBy: "admin",
    verificationMethod: "manual", firstSeenAt: "2026-09-13T00:00:00.000Z",
    lastSeenAt: "2026-09-15T00:00:00.000Z", ...overrides,
  };
}

function dependencies(candidate = image()) {
  return {
    repository: {
      getMirrorContext: vi.fn().mockResolvedValue({ image: candidate, category: "phones", variantBelongsToProduct: true }),
      touchMirrorLastCheckedAt: vi.fn().mockResolvedValue(undefined),
    },
    storage: { exists: vi.fn().mockResolvedValue(true), download: vi.fn().mockResolvedValue(bytes) },
    registry: createMirrorPolicyRegistry([allowed]), now: () => now,
  };
}

describe("Catalog image mirror health", () => {
  it("reports a healthy existing object without downloading it in shallow mode", async () => {
    const deps = dependencies();
    await expect(createCatalogImageMirrorHealthService(deps).check("image-1", { mode: "shallow" }))
      .resolves.toMatchObject({ status: "healthy", mirrored: true, bucket: "catalog-images" });
    expect(deps.storage.exists).toHaveBeenCalledWith(path);
    expect(deps.storage.download).not.toHaveBeenCalled();
  });

  it.each([
    { role: "gallery" as const },
    { role: "gallery" as const, status: "rejected" as const },
    { role: "gallery" as const, status: "unavailable" as const },
  ])("checks retained historical mirror metadata independently of review state %#", async (overrides) => {
    const deps = dependencies(image(overrides));
    await expect(createCatalogImageMirrorHealthService(deps).check("image-1", { mode: "shallow" }))
      .resolves.toMatchObject({ status: "healthy", mirrored: true });
  });

  it("reports incomplete and invalid metadata without contacting Storage", async () => {
    for (const [candidate, status] of [
      [image({ contentHash: null }), "metadata_incomplete"],
      [image({ storageBucket: "other-bucket" }), "metadata_invalid"],
      [image({ storageObjectPath: "../outside.jpg" }), "metadata_invalid"],
      [image({ lastCheckedAt: "2026-09-13T00:00:00.000Z" }), "metadata_invalid"],
    ] as const) {
      const deps = dependencies(candidate);
      await expect(createCatalogImageMirrorHealthService(deps).check("image-1", { mode: "shallow" }))
        .resolves.toMatchObject({ status });
      expect(deps.storage.exists).not.toHaveBeenCalled();
    }
  });

  it("reports a missing object and only touches last_checked_at when requested", async () => {
    const deps = dependencies();
    deps.storage.exists.mockResolvedValue(false);
    await expect(createCatalogImageMirrorHealthService(deps).check("image-1", {
      mode: "shallow", updateLastCheckedAt: true,
    })).resolves.toMatchObject({ status: "missing_object" });
    expect(deps.repository.touchMirrorLastCheckedAt).toHaveBeenCalledTimes(1);
  });

  it("reports stale checks using the seven-day threshold", async () => {
    const deps = dependencies(image({
      mirroredAt: "2026-09-01T00:00:00.000Z",
      lastCheckedAt: "2026-09-08T11:59:59.999Z",
    }));
    await expect(createCatalogImageMirrorHealthService(deps).check("image-1", { mode: "shallow" }))
      .resolves.toMatchObject({ status: "stale_check" });
  });

  it("distinguishes remote-only from never mirrored", async () => {
    const unmirrored = image({
      contentHash: null, storageBucket: null, storageObjectPath: null, contentType: null,
      width: null, height: null, mirroredAt: null, lastCheckedAt: null,
    });
    const remoteOnlyDeps = dependencies({ ...unmirrored, platform: "taobao" });
    remoteOnlyDeps.registry = createMirrorPolicyRegistry([]);
    await expect(createCatalogImageMirrorHealthService(remoteOnlyDeps).check("image-1", { mode: "shallow" }))
      .resolves.toMatchObject({ status: "remote_only", mirrored: false });

    const neverDeps = dependencies(unmirrored);
    await expect(createCatalogImageMirrorHealthService(neverDeps).check("image-1", { mode: "shallow" }))
      .resolves.toMatchObject({ status: "never_mirrored", mirrored: false });
  });

  it("downloads only for an explicit deep check and detects a hash mismatch", async () => {
    const deps = dependencies(image({ contentHash: "b".repeat(64), storageObjectPath: `products/product-1/image-1/${"b".repeat(64)}.jpg` }));
    await expect(createCatalogImageMirrorHealthService(deps).check("image-1", { mode: "deep" }))
      .resolves.toMatchObject({ status: "hash_mismatch" });
    expect(deps.storage.download).toHaveBeenCalledTimes(1);
  });
});
