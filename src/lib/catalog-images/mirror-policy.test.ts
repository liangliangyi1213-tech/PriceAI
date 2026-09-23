import { describe, expect, it } from "vitest";

import type { LiveListingImage } from "@/lib/images/live-listing-image";

import { createCatalogImageSourceRegistry } from "./catalog-image-source";

import {
  createMirrorPolicyRegistry,
  defaultMirrorPolicyRegistry,
  evaluateCatalogImageMirrorEligibility,
  resolveMirrorPolicy,
  type CatalogImageMirrorFacts,
  type MirrorPolicy,
} from "./mirror-policy";

const allowedTaobaoPolicy: MirrorPolicy = {
  platform: "taobao",
  category: "phones",
  mode: "mirror_allowed",
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxDownloadBytes: 8 * 1024 * 1024,
  maxDecodedPixels: 40_000_000,
  transform: "preserve",
  policyVersion: 1,
  authorizationBasis: "test_authorization_record",
};

const approvedPrimary: CatalogImageMirrorFacts = {
  kind: "catalog_image",
  productId: "xiaomi-15",
  variantId: null,
  targetType: "product",
  status: "approved",
  role: "primary",
  isPrimary: true,
  platform: "taobao",
  sourceUrl: "https://img.alicdn.com/catalog/xiaomi-15.jpg",
};

describe("Catalog image mirror policy registry", () => {
  it.each(["taobao", "pdd", "unknown-provider"])("keeps %s remote-only by default", (platform) => {
    expect(resolveMirrorPolicy(defaultMirrorPolicyRegistry, { platform, category: "phones" }))
      .toMatchObject({ mode: "remote_only" });
  });

  it("requires an explicit mirror_allowed policy", () => {
    const registry = createMirrorPolicyRegistry([allowedTaobaoPolicy]);

    expect(resolveMirrorPolicy(registry, { platform: "taobao", category: "phones" }))
      .toEqual(allowedTaobaoPolicy);
    expect(resolveMirrorPolicy(registry, { platform: "taobao", category: "computers" }))
      .toMatchObject({ mode: "remote_only" });
  });

  it("lets an explicit category policy override a platform default", () => {
    const registry = createMirrorPolicyRegistry([
      { ...allowedTaobaoPolicy, category: undefined, mode: "remote_only", allowedMimeTypes: [], maxDownloadBytes: 0, maxDecodedPixels: 0, authorizationBasis: undefined },
      allowedTaobaoPolicy,
    ]);

    expect(resolveMirrorPolicy(registry, { platform: "taobao", category: "phones" }).mode)
      .toBe("mirror_allowed");
    expect(resolveMirrorPolicy(registry, { platform: "taobao", category: "clothing" }).mode)
      .toBe("remote_only");
  });
});

describe("Catalog image mirror eligibility", () => {
  const registry = createMirrorPolicyRegistry([allowedTaobaoPolicy]);

  it("admits an owned fixture only when mirror and source policies are both explicitly injected", () => {
    const fixturePolicy: MirrorPolicy = {
      ...allowedTaobaoPolicy,
      platform: "priceai_fixture",
      category: "test-fixtures",
      authorizationBasis: "priceai_owned_test_asset",
    };
    const fixtureSources = createCatalogImageSourceRegistry([
      { platform: "priceai_fixture", allowedHosts: ["fixture.assets.priceai.test"] },
    ]);

    expect(evaluateCatalogImageMirrorEligibility({
      image: {
        ...approvedPrimary,
        platform: "priceai_fixture",
        sourceUrl: "https://fixture.assets.priceai.test/owned-image.png",
      },
      category: "test-fixtures",
      sourceRegistry: fixtureSources,
    }, createMirrorPolicyRegistry([fixturePolicy]))).toMatchObject({
      eligible: true,
      reason: "eligible",
      policy: fixturePolicy,
    });
  });

  it("allows only an approved primary after explicit policy authorization", () => {
    expect(evaluateCatalogImageMirrorEligibility({ image: approvedPrimary, category: "phones" }, registry))
      .toEqual({ eligible: true, reason: "eligible", policy: allowedTaobaoPolicy });
  });

  it.each([
    [{ status: "candidate" }, "not_approved"],
    [{ role: "gallery", isPrimary: false }, "not_primary"],
    [{ role: "primary", isPrimary: false }, "not_primary"],
  ] as const)("rejects non-primary approval state with %s", (overrides, reason) => {
    expect(evaluateCatalogImageMirrorEligibility({
      image: { ...approvedPrimary, ...overrides }, category: "phones",
    }, registry)).toMatchObject({ eligible: false, reason });
  });

  it.each([
    { targetType: "product", variantId: "xiaomi-15-black" },
    { targetType: "variant", variantId: null },
  ] as const)("rejects inconsistent Product/Variant targets", (overrides) => {
    expect(evaluateCatalogImageMirrorEligibility({
      image: { ...approvedPrimary, ...overrides }, category: "phones",
    }, registry)).toMatchObject({ eligible: false, reason: "target_mismatch" });
  });

  it.each([
    "http://img.alicdn.com/catalog/xiaomi-15.jpg",
    "https://untrusted.example/catalog/xiaomi-15.jpg",
  ])("rejects an invalid provider source: %s", (sourceUrl) => {
    expect(evaluateCatalogImageMirrorEligibility({
      image: { ...approvedPrimary, sourceUrl }, category: "phones",
    }, registry)).toMatchObject({ eligible: false, reason: "invalid_source" });
  });

  it("keeps an approved primary ineligible while its policy is remote-only", () => {
    expect(evaluateCatalogImageMirrorEligibility({
      image: approvedPrimary, category: "phones",
    }, defaultMirrorPolicyRegistry)).toMatchObject({ eligible: false, reason: "policy_remote_only" });
  });

  it("does not admit legacy products.image or Live Offer image shapes", () => {
    const liveOffer: LiveListingImage = {
      platform: "taobao",
      externalProductId: "listing-1",
      url: "https://img.alicdn.com/live.jpg",
      alt: "小米15",
    };

    expect(evaluateCatalogImageMirrorEligibility({ image: { kind: "legacy", url: "/phone.jpg" }, category: "phones" } as never, registry))
      .toMatchObject({ eligible: false, reason: "not_catalog_image" });
    expect(evaluateCatalogImageMirrorEligibility({ image: liveOffer, category: "phones" } as never, registry))
      .toMatchObject({ eligible: false, reason: "not_catalog_image" });
  });
});
