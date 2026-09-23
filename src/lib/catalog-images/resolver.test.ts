import { describe, expect, it } from "vitest";

import { createCatalogImageSourceRegistry } from "./catalog-image-source";
import { resolveCatalogImage, resolveRenderableCatalogImage } from "./resolver";
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
    matchConfidence: 0.98,
    matchEvidence: { method: "manual" },
    contentHash: null,
    storageBucket: null,
    storageObjectPath: null,
    contentType: null,
    width: null,
    height: null,
    mirroredAt: null,
    lastCheckedAt: null,
    verifiedAt: "2026-09-12T00:00:00.000Z",
    verifiedBy: "reviewer",
    verificationMethod: "manual",
    firstSeenAt: "2026-09-11T00:00:00.000Z",
    lastSeenAt: "2026-09-12T00:00:00.000Z",
    ...overrides,
  };
}

describe("catalog image resolver", () => {
  const storageUrl = "https://project.supabase.co/storage/v1/object/public/catalog-images/products/product-1/image-product/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg";

  it("prefers product storage over the same approved primary remote source", () => {
    const result = resolveCatalogImage({
      productId: "product-1",
      variantId: null,
      images: [image()],
      legacyImage: "/legacy-product.jpg",
      storageUrlForImage: () => storageUrl,
    });

    expect(result).toEqual({
      kind: "image", source: "approved_product_storage", url: storageUrl,
      imageId: "image-product", platform: "taobao",
    });
  });

  it("falls back to the same approved primary remote source when storage is invalid", () => {
    expect(resolveCatalogImage({
      productId: "product-1", variantId: null, images: [image()], legacyImage: "/legacy-product.jpg",
      storageUrlForImage: () => null,
    })).toEqual({
      kind: "image", source: "approved_product", url: "https://img.alicdn.com/product.jpg",
      imageId: "image-product", platform: "taobao",
    });
  });

  it("uses an explicitly injected owned-fixture source only for the controlled resolution", () => {
    const fixtureUrl = "https://fixture.assets.priceai.test/owned-image.png";
    const fixtureSources = createCatalogImageSourceRegistry([
      {
        platform: "priceai_fixture",
        allowedHosts: ["fixture.assets.priceai.test"],
        allowedSourceKinds: ["owned_fixture"],
      },
    ]);
    const fixture = image({
      platform: "priceai_fixture",
      sourceKind: "owned_fixture",
      sourceUrl: fixtureUrl,
      sourceHost: "fixture.assets.priceai.test",
    });

    expect(resolveCatalogImage({
      productId: "product-1", variantId: null, images: [fixture], legacyImage: "",
    }).kind).toBe("none");
    expect(resolveCatalogImage({
      productId: "product-1", variantId: null, images: [fixture], legacyImage: "",
      sourceRegistry: fixtureSources,
    })).toMatchObject({ source: "approved_product", url: fixtureUrl, platform: "priceai_fixture" });
  });

  it("prefers variant storage, then variant remote, before any product primary source", () => {
    const variant = image({
      id: "image-variant", variantId: "variant-1", targetType: "variant",
      sourceUrl: "https://img.alicdn.com/variant.jpg",
    });
    const variantStorage = storageUrl.replace("image-product", "variants/variant-1/image-variant");
    expect(resolveCatalogImage({
      productId: "product-1", variantId: "variant-1", images: [image(), variant], legacyImage: "/legacy.jpg",
      storageUrlForImage: (candidate) => candidate.id === "image-variant" ? variantStorage : storageUrl,
    })).toMatchObject({ source: "approved_variant_storage", url: variantStorage, imageId: "image-variant" });

    expect(resolveCatalogImage({
      productId: "product-1", variantId: "variant-1", images: [image(), variant], legacyImage: "/legacy.jpg",
      storageUrlForImage: (candidate) => candidate.id === "image-product" ? storageUrl : null,
    })).toMatchObject({ source: "approved_variant", url: "https://img.alicdn.com/variant.jpg" });
  });

  it("falls back from an unusable variant primary to product storage", () => {
    const variant = image({
      id: "image-variant", variantId: "variant-1", targetType: "variant",
      sourceUrl: "https://untrusted.example/variant.jpg",
    });
    expect(resolveCatalogImage({
      productId: "product-1", variantId: "variant-1", images: [image(), variant], legacyImage: "/legacy.jpg",
      storageUrlForImage: (candidate) => candidate.id === "image-product" ? storageUrl : null,
    })).toMatchObject({ source: "approved_product_storage", imageId: "image-product" });
  });

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
      platform: "taobao",
    });
  });

  it("does not select an arbitrary Variant primary without an explicit Variant context", () => {
    expect(resolveCatalogImage({
      productId: "product-1",
      variantId: null,
      images: [image({
        id: "image-variant",
        variantId: "variant-1",
        targetType: "variant",
        sourceUrl: "https://img.alicdn.com/variant.jpg",
      })],
      legacyImage: "/legacy-product.jpg",
    })).toEqual({
      kind: "image",
      source: "legacy",
      url: "/legacy-product.jpg",
      imageId: null,
      platform: null,
    });
  });

  it("falls back from product primary to a valid legacy image", () => {
    expect(resolveCatalogImage({
      productId: "product-1",
      variantId: null,
      images: [image()],
      legacyImage: "/legacy-product.jpg",
    }).source).toBe("approved_product");

    expect(resolveCatalogImage({
      productId: "product-1",
      variantId: null,
      images: [],
      legacyImage: "/legacy-product.jpg",
    })).toEqual({
      kind: "image",
      source: "legacy",
      url: "/legacy-product.jpg",
      imageId: null,
      platform: null,
    });
  });

  it.each(["candidate", "rejected", "unavailable"] as const)(
    "does not expose a %s image as a Catalog primary",
    (status) => {
      expect(resolveCatalogImage({
        productId: "product-1",
        variantId: null,
        images: [image({ status })],
        legacyImage: "",
      })).toEqual({ kind: "none", source: "none", url: null, imageId: null, platform: null });
    },
  );

  it("rejects an approved remote image outside the provider hostname allowlist", () => {
    expect(resolveCatalogImage({
      productId: "product-1",
      variantId: null,
      images: [image({ sourceUrl: "https://untrusted.example/product.jpg" })],
      legacyImage: "/legacy-product.jpg",
    })).toEqual({
      kind: "image",
      source: "legacy",
      url: "/legacy-product.jpg",
      imageId: null,
      platform: null,
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
      variantId: null,
      images: [],
      legacyImage,
    })).toEqual({ kind: "none", source: "none", url: null, imageId: null, platform: null });
  });

  it("does not resolve an approved image belonging to another product", () => {
    expect(resolveCatalogImage({
      productId: "product-1",
      variantId: null,
      images: [image({ productId: "product-2" })],
      legacyImage: "",
    }).kind).toBe("none");
  });

  it("turns one failed image identity into a neutral no-image state without retrying", () => {
    const resolved = resolveCatalogImage({
      productId: "product-1",
      variantId: null,
      images: [image()],
      legacyImage: "/legacy-product.jpg",
    });

    expect(resolveRenderableCatalogImage(resolved, null)).toEqual(resolved);
    expect(resolveRenderableCatalogImage(resolved, resolved.url)).toEqual({
      kind: "none",
      source: "none",
      url: null,
      imageId: null,
      platform: null,
    });
  });

  it("accepts only a server-resolved catalog storage URL for rendering", () => {
    const resolution = {
      kind: "image" as const,
      source: "approved_product_storage" as const,
      url: storageUrl,
      imageId: "image-product",
      platform: "taobao",
    };
    expect(resolveRenderableCatalogImage(resolution, null)).toEqual(resolution);
    expect(resolveRenderableCatalogImage({ ...resolution, url: "https://untrusted.example/image.jpg" }, null).kind)
      .toBe("none");
  });
});
