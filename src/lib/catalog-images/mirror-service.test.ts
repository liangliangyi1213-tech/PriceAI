import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { CatalogImage } from "./types";
import { createCatalogImageSourceRegistry } from "./catalog-image-source";
import { createMirrorPolicyRegistry, type MirrorPolicy } from "./mirror-policy";
import { createCatalogImageMirrorService } from "./mirror-service";
import { CatalogImageMirrorError } from "./mirror-service-types";

const image: CatalogImage = {
  id: "image-1", productId: "product-1", variantId: null, targetType: "product",
  role: "primary", status: "approved", platform: "taobao", externalProductId: "listing-1",
  externalVariantId: null, sourceKind: "pict_url", sourceUrl: "https://img.alicdn.com/product.png",
  sourceHost: "img.alicdn.com", sourceUrlHash: "a".repeat(64), matchConfidence: 1,
  matchEvidence: { matcher: "taobao_phone_strict" }, contentHash: null, storageBucket: null,
  storageObjectPath: null, contentType: null, width: null, height: null, mirroredAt: null,
  lastCheckedAt: null, verifiedAt: "2026-09-01T00:00:00.000Z", verifiedBy: "reviewer",
  verificationMethod: "manual_cross_check", firstSeenAt: "2026-09-01T00:00:00.000Z",
  lastSeenAt: "2026-09-01T00:00:00.000Z",
};

const allowedPolicy: MirrorPolicy = {
  platform: "taobao", category: "phones", mode: "mirror_allowed",
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"], maxDownloadBytes: 1_000_000,
  maxDecodedPixels: 40_000_000, transform: "preserve", policyVersion: 1,
  authorizationBasis: "test-only",
};

const bytes = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x14,
]);
const contentHash = createHash("sha256").update(bytes).digest("hex");

function dependencies(overrides: Record<string, unknown> = {}) {
  const repository = {
    getMirrorContext: vi.fn().mockResolvedValue({ image, category: "phones", variantBelongsToProduct: true }),
    updateMirrorMetadata: vi.fn().mockResolvedValue(undefined),
  };
  const download = vi.fn().mockResolvedValue({ bytes, headerContentType: "image/png" });
  const storage = {
    exists: vi.fn().mockResolvedValue(false),
    upload: vi.fn().mockResolvedValue("uploaded" as const),
    download: vi.fn(),
  };
  return {
    repository, download, storage,
    registry: createMirrorPolicyRegistry([allowedPolicy]),
    now: () => new Date("2026-09-14T00:00:00.000Z"),
    ...overrides,
  };
}

describe("Catalog image mirror service", () => {
  it("uses an explicitly injected owned-fixture source registry without enabling the production registry", async () => {
    const fixtureSources = createCatalogImageSourceRegistry([
      { platform: "priceai_fixture", allowedHosts: ["fixture.assets.priceai.test"] },
    ]);
    const fixturePolicy: MirrorPolicy = {
      ...allowedPolicy,
      platform: "priceai_fixture",
      category: "test-fixtures",
      authorizationBasis: "priceai_owned_test_asset",
    };
    const deps = dependencies({
      registry: createMirrorPolicyRegistry([fixturePolicy]),
      sourceRegistry: fixtureSources,
    });
    deps.repository.getMirrorContext.mockResolvedValue({
      image: {
        ...image,
        platform: "priceai_fixture",
        sourceUrl: "https://fixture.assets.priceai.test/owned-image.png",
      },
      category: "test-fixtures",
      variantBelongsToProduct: true,
    });

    await expect(createCatalogImageMirrorService(deps).mirror("image-1"))
      .resolves.toMatchObject({ status: "mirrored" });
    expect(deps.download).toHaveBeenCalledWith(expect.objectContaining({
      platform: "priceai_fixture",
      sourceRegistry: fixtureSources,
    }));
  });

  it("rejects remote-only policy without issuing a network request", async () => {
    const deps = dependencies({ registry: createMirrorPolicyRegistry([]) });
    await expect(createCatalogImageMirrorService(deps).mirror("image-1"))
      .rejects.toEqual(new CatalogImageMirrorError("policy_remote_only"));
    expect(deps.download).not.toHaveBeenCalled();
    expect(deps.storage.upload).not.toHaveBeenCalled();
  });

  it("rejects a transform policy that this preserve-only phase does not implement", async () => {
    const deps = dependencies({
      registry: createMirrorPolicyRegistry([{ ...allowedPolicy, transform: "normalize_webp" }]),
    });
    await expect(createCatalogImageMirrorService(deps).mirror("image-1"))
      .rejects.toEqual(new CatalogImageMirrorError("unsupported_transform"));
    expect(deps.download).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: "candidate" }, "not_approved"],
    [{ role: "gallery", isPrimary: false }, "not_primary"],
  ] as const)("rejects ineligible image state without mutation", async (imageOverrides, code) => {
    const deps = dependencies();
    deps.repository.getMirrorContext.mockResolvedValue({ image: { ...image, ...imageOverrides }, category: "phones", variantBelongsToProduct: true });
    await expect(createCatalogImageMirrorService(deps).mirror("image-1"))
      .rejects.toMatchObject({ code });
    expect(deps.repository.updateMirrorMetadata).not.toHaveBeenCalled();
  });

  it("rejects a Variant that no longer belongs to its Product", async () => {
    const deps = dependencies();
    deps.repository.getMirrorContext.mockResolvedValue({ image: { ...image, targetType: "variant", variantId: "variant-1" }, category: "phones", variantBelongsToProduct: false });
    await expect(createCatalogImageMirrorService(deps).mirror("image-1"))
      .rejects.toEqual(new CatalogImageMirrorError("target_mismatch"));
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("uploads validated bytes and writes only mirror metadata", async () => {
    const deps = dependencies();
    await expect(createCatalogImageMirrorService(deps).mirror("image-1")).resolves.toEqual({
      status: "mirrored", storageStatus: "uploaded", contentHash,
      storageBucket: "catalog-images",
      storageObjectPath: `products/product-1/image-1/${contentHash}.png`,
    });
    expect(deps.repository.updateMirrorMetadata).toHaveBeenCalledWith({
      imageId: "image-1", expectedProductId: "product-1", expectedVariantId: null,
      expectedTargetType: "product", expectedPlatform: "taobao",
      expectedSourceUrlHash: "a".repeat(64),
      storageBucket: "catalog-images", storageObjectPath: `products/product-1/image-1/${contentHash}.png`,
      contentHash, contentType: "image/png", width: 10, height: 20,
      mirroredAt: "2026-09-14T00:00:00.000Z", lastCheckedAt: "2026-09-14T00:00:00.000Z",
    });
  });

  it("preserves uploaded content for an idempotent retry after metadata update failure", async () => {
    const deps = dependencies();
    deps.repository.updateMirrorMetadata
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(undefined);
    await expect(createCatalogImageMirrorService(deps).mirror("image-1"))
      .rejects.toEqual(new CatalogImageMirrorError("metadata_update_failed"));
    expect(deps.repository.getMirrorContext.mock.results[0]).toBeDefined();

    deps.storage.exists.mockResolvedValue(true);
    deps.storage.download.mockResolvedValue(bytes);
    await expect(createCatalogImageMirrorService(deps).mirror("image-1"))
      .resolves.toMatchObject({ status: "mirrored", storageStatus: "reused", contentHash });
    expect(deps.storage.upload).toHaveBeenCalledTimes(1);
    expect(deps.repository.updateMirrorMetadata).toHaveBeenCalledTimes(2);
  });

  it("maps a post-upload repository read failure to metadata_update_failed", async () => {
    const deps = dependencies();
    deps.repository.getMirrorContext
      .mockResolvedValueOnce({ image, category: "phones", variantBelongsToProduct: true })
      .mockRejectedValueOnce(new Error("database connection detail"));
    await expect(createCatalogImageMirrorService(deps).mirror("image-1"))
      .rejects.toEqual(new CatalogImageMirrorError("metadata_update_failed"));
    expect(deps.repository.updateMirrorMetadata).not.toHaveBeenCalled();
    expect(deps.storage.upload).toHaveBeenCalledTimes(1);
  });

  it("maps the initial repository failure to a stable safe code", async () => {
    const deps = dependencies();
    deps.repository.getMirrorContext.mockRejectedValue(new Error("database credential detail"));
    await expect(createCatalogImageMirrorService(deps).mirror("image-1"))
      .rejects.toEqual(new CatalogImageMirrorError("repository_unavailable"));
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("allows metadata write after demotion while preserving the new review state", async () => {
    const deps = dependencies();
    deps.repository.getMirrorContext
      .mockResolvedValueOnce({ image, category: "phones", variantBelongsToProduct: true })
      .mockResolvedValueOnce({ image: { ...image, role: "gallery", isPrimary: false }, category: "phones", variantBelongsToProduct: true });
    await expect(createCatalogImageMirrorService(deps).mirror("image-1")).resolves.toMatchObject({ status: "mirrored" });
    expect(deps.repository.updateMirrorMetadata).toHaveBeenCalledTimes(1);
    expect(deps.repository.updateMirrorMetadata.mock.calls[0][0]).not.toHaveProperty("status");
    expect(deps.repository.updateMirrorMetadata.mock.calls[0][0]).not.toHaveProperty("role");
    expect(deps.repository.updateMirrorMetadata.mock.calls[0][0]).not.toHaveProperty("isPrimary");
  });

  it.each([
    ["upload_failed", { storage: { exists: vi.fn().mockResolvedValue(false), upload: vi.fn().mockResolvedValue("failed"), download: vi.fn() } }],
    ["metadata_update_failed", { repository: { getMirrorContext: vi.fn().mockResolvedValue({ image, category: "phones", variantBelongsToProduct: true }), updateMirrorMetadata: vi.fn().mockRejectedValue(new Error("raw database detail")) } }],
  ])("returns stable %s without changing approval facts", async (code, overrides) => {
    const deps = dependencies(overrides);
    await expect(createCatalogImageMirrorService(deps).mirror("image-1"))
      .rejects.toMatchObject({ code });
    expect(image.status).toBe("approved");
    expect(image.role).toBe("primary");
    expect(image.sourceUrl).toBe("https://img.alicdn.com/product.png");
  });
});
