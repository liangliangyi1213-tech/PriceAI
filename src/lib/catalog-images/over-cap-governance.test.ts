import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { CatalogImage } from "./types";
import {
  analyzeActiveCatalogImageCandidateOverCap,
  analyzeCatalogImageCandidateOverCap,
} from "./over-cap-governance";

function candidate(overrides: Partial<CatalogImage> = {}): CatalogImage {
  return {
    id: "candidate-1",
    productId: "xiaomi-15",
    variantId: null,
    targetType: "product",
    role: "gallery",
    status: "candidate",
    platform: "taobao",
    externalProductId: "external-secret",
    externalVariantId: null,
    sourceKind: "pict_url",
    sourceUrl: "https://img.alicdn.com/product.jpg",
    sourceHost: "img.alicdn.com",
    sourceUrlHash: "secret-hash",
    matchConfidence: 1,
    matchEvidence: {
      schemaVersion: 1,
      matcher: "taobao_phone_strict",
      matchLevel: "product",
      signals: ["brand", "model", "category"],
      privateProviderEvidence: "must-not-leak",
    },
    contentHash: null,
    storageBucket: null,
    storageObjectPath: null,
    contentType: null,
    width: null,
    height: null,
    mirroredAt: null,
    lastCheckedAt: null,
    verifiedAt: null,
    verifiedBy: null,
    verificationMethod: null,
    firstSeenAt: "2026-09-01T00:00:00.000Z",
    lastSeenAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("catalog image Candidate over-cap governance", () => {
  it("ranks confidence, evidence, source quality, recency, longevity, then an internal-only stable tie-breaker", () => {
    const report = analyzeCatalogImageCandidateOverCap([
      candidate({ id: "f", matchConfidence: 0.8 }),
      candidate({ id: "e", matchEvidence: { schemaVersion: 1, matcher: "taobao_phone_strict", matchLevel: "product", signals: ["brand"] } }),
      candidate({ id: "d", sourceKind: "small_images_0" }),
      candidate({ id: "c", lastSeenAt: "2026-09-09T00:00:00.000Z" }),
      candidate({ id: "b", firstSeenAt: "2026-09-02T00:00:00.000Z" }),
      candidate({ id: "a" }),
    ]);

    expect(report.items.map((item) => item.basis)).toEqual([
      expect.objectContaining({ confidence: 1, evidenceSignalCount: 3, sourceQuality: "preferred", lastSeenAt: "2026-09-10T00:00:00.000Z", firstSeenAt: "2026-09-01T00:00:00.000Z" }),
      expect.objectContaining({ confidence: 1, evidenceSignalCount: 3, sourceQuality: "preferred", firstSeenAt: "2026-09-02T00:00:00.000Z" }),
      expect.objectContaining({ confidence: 1, sourceQuality: "preferred", lastSeenAt: "2026-09-09T00:00:00.000Z" }),
      expect.objectContaining({ confidence: 1, sourceQuality: "fallback" }),
      expect.objectContaining({ confidence: 1, evidenceSignalCount: 1 }),
      expect.objectContaining({ confidence: 0.8 }),
    ]);
    expect(report.items.map((item) => item.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("suggests keeping at most three active Candidates and redacts source identities and raw evidence", () => {
    const report = analyzeCatalogImageCandidateOverCap(
      Array.from({ length: 6 }, (_, index) => candidate({ id: `candidate-${index + 1}` })),
    );

    expect(report).toMatchObject({ activeCount: 6, keepCount: 3, suggestedCleanupCount: 3 });
    expect(report.items.map((item) => item.recommendation)).toEqual([
      "keep", "keep", "keep", "suggested_cleanup", "suggested_cleanup", "suggested_cleanup",
    ]);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("candidate-");
    expect(serialized).not.toContain("external-secret");
    expect(serialized).not.toContain("alicdn.com");
    expect(serialized).not.toContain("secret-hash");
    expect(serialized).not.toContain("privateProviderEvidence");
  });

  it("ignores approved, primary, rejected, unavailable, other Product, and other platform records", () => {
    const report = analyzeCatalogImageCandidateOverCap([
      candidate(),
      candidate({ id: "approved", status: "approved" }),
      candidate({ id: "primary", status: "approved", role: "primary" }),
      candidate({ id: "rejected", status: "rejected" }),
      candidate({ id: "unavailable", status: "unavailable" }),
      candidate({ id: "other-product", productId: "iphone-16" }),
      candidate({ id: "other-platform", platform: "pdd" }),
    ], { productId: "xiaomi-15", platform: "taobao" });

    expect(report.activeCount).toBe(1);
    expect(report.items).toHaveLength(1);
  });

  it("does not treat URL or hash similarity as an identity or deduplication signal", () => {
    const report = analyzeCatalogImageCandidateOverCap([
      candidate({ id: "candidate-a", sourceUrl: "https://img.alicdn.com/same.jpg", sourceUrlHash: "same" }),
      candidate({ id: "candidate-b", sourceUrl: "https://img.alicdn.com/same.jpg", sourceUrlHash: "same" }),
    ]);

    expect(report.activeCount).toBe(2);
    expect(report.items).toHaveLength(2);
  });

  it("loads the scoped active Candidates through the read-only repository boundary", async () => {
    const repository = {
      getActiveCandidates: vi.fn().mockResolvedValue([candidate()]),
    };

    const report = await analyzeActiveCatalogImageCandidateOverCap("xiaomi-15", "taobao", repository);

    expect(repository.getActiveCandidates).toHaveBeenCalledWith("xiaomi-15", "taobao");
    expect(report).toMatchObject({ activeCount: 1, keepCount: 1, suggestedCleanupCount: 0 });
  });
});
