import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveCatalogImageForProduct, resolveCatalogImagesForProducts } from "./service";
import type { CatalogImage } from "./types";

const approvedProductImage: CatalogImage = {
  id: "image-1",
  productId: "product-1",
  variantId: null,
  targetType: "product",
  role: "primary",
  status: "approved",
  platform: "taobao",
  externalProductId: "tb-1",
  externalVariantId: null,
  sourceKind: "pict_url",
  sourceUrl: "https://img.alicdn.com/product.jpg",
  sourceHost: "img.alicdn.com",
  sourceUrlHash: "a".repeat(64),
  matchConfidence: 0.98,
  matchEvidence: { method: "manual" },
  contentHash: null,
  storageBucket: null,
  storageObjectPath: null,
  verifiedAt: "2026-09-12T00:00:00.000Z",
};

describe("server catalog image resolver", () => {
  it("loads approved primaries through the repository before resolving", async () => {
    const repository = {
      getApprovedPrimaries: vi.fn().mockResolvedValue([approvedProductImage]),
    };

    await expect(resolveCatalogImageForProduct({
      productId: "product-1",
      variantId: null,
      legacyImage: "/legacy.jpg",
    }, repository)).resolves.toMatchObject({
      source: "approved_product",
      url: "https://img.alicdn.com/product.jpg",
    });
    expect(repository.getApprovedPrimaries).toHaveBeenCalledWith("product-1");
  });

  it("batch resolves each explicit Product or Variant context without crossing targets", async () => {
    const variantImage = {
      ...approvedProductImage,
      id: "image-variant",
      productId: "product-2",
      variantId: "variant-2",
      targetType: "variant" as const,
      sourceUrl: "https://img.alicdn.com/variant.jpg",
    };
    const repository = {
      getApprovedPrimariesForProducts: vi.fn().mockResolvedValue([approvedProductImage, variantImage]),
    };

    await expect(resolveCatalogImagesForProducts([
      { productId: "product-1", variantId: null, legacyImage: "/legacy-one.jpg" },
      { productId: "product-2", variantId: null, legacyImage: "/legacy-two.jpg" },
      { productId: "product-2", variantId: "variant-2", legacyImage: "/legacy-two.jpg" },
    ], repository)).resolves.toEqual([
      expect.objectContaining({ productId: "product-1", variantId: null, resolution: expect.objectContaining({ source: "approved_product" }) }),
      expect.objectContaining({ productId: "product-2", variantId: null, resolution: expect.objectContaining({ source: "legacy" }) }),
      expect.objectContaining({ productId: "product-2", variantId: "variant-2", resolution: expect.objectContaining({ source: "approved_variant" }) }),
    ]);
    expect(repository.getApprovedPrimariesForProducts).toHaveBeenCalledWith(["product-1", "product-2"]);
  });
});
