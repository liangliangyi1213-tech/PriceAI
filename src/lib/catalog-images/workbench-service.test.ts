import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildCatalogImageWorkbench } from "./workbench-service";
import type { CatalogImage, CatalogImagePrimaryEvent } from "./types";

function candidate(overrides: Partial<CatalogImage> = {}): CatalogImage {
  return {
    id: "candidate-1", productId: "product-1", variantId: null, targetType: "product",
    role: "gallery", status: "candidate", platform: "taobao", externalProductId: "1234567890",
    externalVariantId: null, sourceKind: "pict_url", sourceUrl: "https://img.alicdn.com/candidate.jpg",
    sourceHost: "img.alicdn.com", sourceUrlHash: "a".repeat(64), matchConfidence: 0.98,
    matchEvidence: { schemaVersion: 1, matcher: "taobao_phone_strict", matchLevel: "product", signals: ["brand", "model"], raw: "must-not-leak" },
    contentHash: null, storageBucket: null, storageObjectPath: null, verifiedAt: null,
    verifiedBy: null, verificationMethod: null, firstSeenAt: "2026-09-10T00:00:00.000Z",
    lastSeenAt: "2026-09-12T00:00:00.000Z", ...overrides,
  };
}

describe("Catalog image workbench view model", () => {
  it("maps candidates, current primary and history without exposing raw evidence or external identity", () => {
    const primary = candidate({ id: "primary-1", status: "approved", role: "primary", verifiedAt: "2026-09-11T00:00:00.000Z", verifiedBy: "reviewer-a", verificationMethod: "manual" });
    const event: CatalogImagePrimaryEvent = {
      id: "event-1", productId: "product-1", variantId: null, targetType: "product",
      previousImageId: null, newImageId: "primary-1", action: "initial",
      reason: "verified", changedBy: "reviewer-a", createdAt: "2026-09-11T00:00:00.000Z",
    };
    const model = buildCatalogImageWorkbench({
      candidates: [candidate()], primaries: [primary], events: [event],
      products: [{ id: "product-1", name: "示例商品", category: "phone" }], variants: [],
    });

    expect(model.candidates).toHaveLength(1);
    expect(model.candidates[0]).toMatchObject({
      productName: "示例商品", category: "手机", targetType: "product", targetLabel: "Product-level",
      platform: "淘宝", matchConfidence: "98.0%", externalProductId: "12••••7890",
      evidence: { matcher: "taobao_phone_strict", matchLevel: "product", signals: ["brand", "model"] },
      currentPrimary: { platform: "淘宝", verifiedBy: "reviewer-a" },
      events: [{ action: "initial", changedBy: "reviewer-a" }],
    });
    expect(JSON.stringify(model)).not.toContain("must-not-leak");
    expect(model.candidates[0]).not.toHaveProperty("sourceUrl");
  });

  it("marks a Variant target clearly and rejects inconsistent Catalog identity data", () => {
    const model = buildCatalogImageWorkbench({
      candidates: [candidate({ variantId: "variant-1", targetType: "variant" })], primaries: [], events: [],
      products: [{ id: "product-1", name: "示例商品", category: "headphones" }],
      variants: [{ id: "variant-1", productId: "product-1", label: "黑色 / 国行" }],
    });
    expect(model.candidates[0]).toMatchObject({ category: "耳机", targetType: "variant", targetLabel: "Variant-level · 黑色 / 国行" });

    expect(buildCatalogImageWorkbench({
      candidates: [candidate({ variantId: "variant-other", targetType: "variant" })], primaries: [], events: [],
      products: [{ id: "product-1", name: "示例商品", category: "phone" }], variants: [],
    }).candidates).toEqual([]);
  });
});
