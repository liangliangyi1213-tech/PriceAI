import { describe, expect, it } from "vitest";

import { resolveCatalogImage } from "./resolver";
import type { CatalogImage } from "./types";

function image(overrides: Partial<CatalogImage> = {}): CatalogImage {
  return {
    id: "image-product",
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
    contentHash: null,
    storageBucket: null,
    storageObjectPath: null,
    verifiedAt: "2026-09-12T00:00:00.000Z",
    ...overrides,
  };
}

describe("catalog image resolver", () => {
  it("prefers an approved variant primary over the product primary and legacy image", () => {
    const result = resolveCatalogImage({
      productId: "product-1",
      variantId: "variant-1",
      images: [
        image(),
        image({
          id: "image-variant",
          variantId: "variant-1",
          targetType: "variant",
          sourceUrl: "https://img.alicdn.com/variant.jpg",
        }),
      ],
      legacyImage: "/legacy-product.jpg",
    });

    expect(result).toEqual({
      kind: "image",
      source: "approved_variant",
      url: "https://img.alicdn.com/variant.jpg",
      imageId: "image-variant",
    });
  });

  it("falls back from product primary to a valid legacy image", () => {
    expect(resolveCatalogImage({
      productId: "product-1",
      images: [image()],
      legacyImage: "/legacy-product.jpg",
    }).source).toBe("approved_product");

    expect(resolveCatalogImage({
      productId: "product-1",
      images: [],
      legacyImage: "/legacy-product.jpg",
    })).toEqual({
      kind: "image",
      source: "legacy",
      url: "/legacy-product.jpg",
      imageId: null,
    });
  });

  it.each([
    "",
    "/phone-placeholder.svg",
    "/catalog/product-placeholder.png",
    "http://images.example.com/product.jpg",
    "data:image/png;base64,unsafe",
    "//images.example.com/product.jpg",
  ])("treats invalid legacy value %s as a neutral no-image state", (legacyImage) => {
    expect(resolveCatalogImage({
      productId: "product-1",
      images: [],
      legacyImage,
    })).toEqual({ kind: "none", source: "none", url: null, imageId: null });
  });

  it("does not resolve an approved image belonging to another product", () => {
    expect(resolveCatalogImage({
      productId: "product-1",
      images: [image({ productId: "product-2" })],
      legacyImage: "",
    }).kind).toBe("none");
  });
});
