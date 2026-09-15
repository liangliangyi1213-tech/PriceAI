import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveCatalogImageStorageUrl } from "./storage-resolver";
import type { CatalogImage } from "./types";

const hash = "b".repeat(64);

function mirroredImage(overrides: Partial<CatalogImage> = {}): CatalogImage {
  return {
    id: "image-1", productId: "product-1", variantId: null, targetType: "product",
    role: "primary", status: "approved", platform: "taobao", externalProductId: "external-1",
    externalVariantId: null, sourceKind: "pict_url", sourceUrl: "https://img.alicdn.com/product.jpg",
    sourceHost: "img.alicdn.com", sourceUrlHash: "a".repeat(64), matchConfidence: 1,
    matchEvidence: { schemaVersion: 1 }, contentHash: hash, storageBucket: "catalog-images",
    storageObjectPath: `products/product-1/image-1/${hash}.jpg`, contentType: "image/jpeg",
    width: 1200, height: 900, mirroredAt: "2026-09-15T00:00:00.000Z",
    lastCheckedAt: "2026-09-15T00:00:00.000Z", verifiedAt: "2026-09-14T00:00:00.000Z",
    verifiedBy: "admin", verificationMethod: "manual", firstSeenAt: "2026-09-13T00:00:00.000Z",
    lastSeenAt: "2026-09-15T00:00:00.000Z", ...overrides,
  };
}

function publicUrl(path: string) {
  return `https://project.supabase.co/storage/v1/object/public/catalog-images/${path}`;
}

describe("Catalog image Storage resolver", () => {
  it("constructs a public URL server-side for valid product and variant mirror metadata", () => {
    const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: publicUrl(path) } }));
    expect(resolveCatalogImageStorageUrl(mirroredImage(), { getPublicUrl }))
      .toBe(publicUrl(`products/product-1/image-1/${hash}.jpg`));

    const variant = mirroredImage({
      id: "image-2", targetType: "variant", variantId: "variant-1",
      storageObjectPath: `products/product-1/variants/variant-1/image-2/${hash}.webp`,
      contentType: "image/webp",
    });
    expect(resolveCatalogImageStorageUrl(variant, { getPublicUrl }))
      .toBe(publicUrl(`products/product-1/variants/variant-1/image-2/${hash}.webp`));
  });

  it.each([
    { storageBucket: "other-bucket" },
    { storageObjectPath: "../outside.jpg" },
    { storageObjectPath: `products/product-2/image-1/${hash}.jpg` },
    { contentHash: null },
    { contentType: null },
    { width: null },
    { height: null },
    { mirroredAt: null },
    { contentType: "image/png" as const },
  ])("rejects invalid or incomplete mirror metadata %#", (overrides) => {
    const getPublicUrl = vi.fn();
    expect(resolveCatalogImageStorageUrl(mirroredImage(overrides), { getPublicUrl })).toBeNull();
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it("does not expose candidate, gallery, rejected, or unavailable images through Storage", () => {
    const getPublicUrl = vi.fn();
    for (const candidate of [
      mirroredImage({ status: "candidate" }),
      mirroredImage({ role: "gallery" }),
      mirroredImage({ status: "rejected", role: "gallery" }),
      mirroredImage({ status: "unavailable", role: "gallery" }),
    ]) {
      expect(resolveCatalogImageStorageUrl(candidate, { getPublicUrl })).toBeNull();
    }
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it("rejects incomplete metadata before initializing the default Storage client", () => {
    expect(() => resolveCatalogImageStorageUrl(mirroredImage({ contentHash: null }))).not.toThrow();
    expect(resolveCatalogImageStorageUrl(mirroredImage({ contentHash: null }))).toBeNull();
  });

  it("falls back when public URL construction fails or returns an invalid URL", () => {
    expect(resolveCatalogImageStorageUrl(mirroredImage(), {
      getPublicUrl: () => { throw new Error("configuration unavailable"); },
    })).toBeNull();
    expect(resolveCatalogImageStorageUrl(mirroredImage(), {
      getPublicUrl: () => ({ data: { publicUrl: "https://untrusted.example/image.jpg" } }),
    })).toBeNull();
  });
});
