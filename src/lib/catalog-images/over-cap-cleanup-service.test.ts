import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { rejectCatalogImageCandidate } from "./review-service";
import {
  cleanupCatalogImageCandidateOverCap,
  CatalogImageOverCapCleanupError,
  OVER_CAP_REJECTION_REASON,
} from "./over-cap-cleanup-service";
import type { CatalogImage } from "./types";

function candidate(index: number, overrides: Partial<CatalogImage> = {}): CatalogImage {
  const second = String(index).padStart(2, "0");
  return {
    id: `candidate-${index}`,
    productId: "xiaomi-15",
    variantId: null,
    targetType: "product",
    role: "gallery",
    status: "candidate",
    platform: "taobao",
    externalProductId: `external-${index}`,
    externalVariantId: null,
    sourceKind: "pict_url",
    sourceUrl: `https://img.alicdn.com/${index}.jpg`,
    sourceHost: "img.alicdn.com",
    sourceUrlHash: "a".repeat(64),
    matchConfidence: 1,
    matchEvidence: { schemaVersion: 1, matcher: "taobao_phone_strict", matchLevel: "product", signals: ["brand", "model", "category"] },
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
    firstSeenAt: `2026-09-13T05:09:${second}.000Z`,
    lastSeenAt: `2026-09-13T05:09:${second}.000Z`,
    ...overrides,
  };
}

function inMemoryRepository(initial: CatalogImage[]) {
  const state = new Map(initial.map((image) => [image.id, image]));
  const rejectionReasons: string[] = [];
  return {
    state,
    rejectionReasons,
    getActiveCandidates: vi.fn(async (productId: string, platform: string) => (
      [...state.values()].filter((image) => image.productId === productId
        && image.platform === platform && image.status === "candidate")
    )),
    getReviewContext: vi.fn(async (imageId: string) => {
      const image = state.get(imageId);
      return image ? { image, productExists: true, variantBelongsToProduct: true } : null;
    }),
    rejectCandidate: vi.fn(async ({ imageId, reason }: { imageId: string; reason: string }) => {
      const image = state.get(imageId);
      if (!image || image.status !== "candidate") return false;
      rejectionReasons.push(reason);
      state.set(imageId, { ...image, status: "rejected" });
      return true;
    }),
    approveCandidate: vi.fn(),
    promotePrimary: vi.fn(),
  };
}

const request = {
  authorized: true,
  sameOrigin: true,
  confirmed: true,
  reviewer: "priceai-admin-workbench",
  productId: "xiaomi-15",
  platform: "taobao",
} as const;

describe("Catalog image over-cap cleanup service", () => {
  it("recalculates and rejects only the three currently lowest-ranked active Candidates", async () => {
    const primary = candidate(9, { id: "approved-primary", status: "approved", role: "primary" });
    const repository = inMemoryRepository([primary, ...Array.from({ length: 6 }, (_, index) => candidate(index + 1))]);

    const result = await cleanupCatalogImageCandidateOverCap(request, {
      repository,
      reject: rejectCatalogImageCandidate,
    });

    expect(result).toEqual({ activeBefore: 6, activeAfter: 3, processed: 3, concurrentSkipped: 0 });
    expect([...repository.state.values()].filter((image) => image.status === "candidate")).toHaveLength(3);
    expect([...repository.state.values()].filter((image) => image.status === "rejected").map((image) => image.id).sort())
      .toEqual(["candidate-1", "candidate-2", "candidate-3"]);
    expect(repository.state.get("approved-primary")?.status).toBe("approved");
    expect(repository.state.get("approved-primary")?.role).toBe("primary");
    expect(repository.rejectionReasons).toEqual([OVER_CAP_REJECTION_REASON, OVER_CAP_REJECTION_REASON, OVER_CAP_REJECTION_REASON]);
  });

  it("is idempotent after the scope has reached capacity", async () => {
    const repository = inMemoryRepository(Array.from({ length: 6 }, (_, index) => candidate(index + 1)));
    await cleanupCatalogImageCandidateOverCap(request, { repository, reject: rejectCatalogImageCandidate });

    await expect(cleanupCatalogImageCandidateOverCap(request, { repository, reject: rejectCatalogImageCandidate }))
      .resolves.toEqual({ activeBefore: 3, activeAfter: 3, processed: 0, concurrentSkipped: 0 });
  });

  it("safely skips a Candidate concurrently changed to approved and continues recalculating", async () => {
    const repository = inMemoryRepository(Array.from({ length: 6 }, (_, index) => candidate(index + 1)));
    const originalGetReviewContext = repository.getReviewContext;
    let changed = false;
    repository.getReviewContext = vi.fn(async (imageId: string) => {
      if (!changed) {
        changed = true;
        const current = repository.state.get(imageId)!;
        repository.state.set(imageId, { ...current, status: "approved" });
      }
      return originalGetReviewContext(imageId);
    });

    const result = await cleanupCatalogImageCandidateOverCap(request, {
      repository,
      reject: rejectCatalogImageCandidate,
    });

    expect(result).toEqual({ activeBefore: 6, activeAfter: 3, processed: 2, concurrentSkipped: 1 });
    expect([...repository.state.values()].filter((image) => image.status === "approved")).toHaveLength(1);
    expect(repository.approveCandidate).not.toHaveBeenCalled();
    expect(repository.promotePrimary).not.toHaveBeenCalled();
  });

  it("rejects missing admin, origin, confirmation, or invalid scope before reading Candidates", async () => {
    const repository = inMemoryRepository([]);
    for (const invalid of [
      { ...request, authorized: false },
      { ...request, sameOrigin: false },
      { ...request, confirmed: false },
      { ...request, productId: "" },
    ]) {
      await expect(cleanupCatalogImageCandidateOverCap(invalid, { repository, reject: rejectCatalogImageCandidate }))
        .rejects.toBeInstanceOf(CatalogImageOverCapCleanupError);
    }
    expect(repository.getActiveCandidates).not.toHaveBeenCalled();
  });

  it("returns no Candidate identity or source data", async () => {
    const repository = inMemoryRepository(Array.from({ length: 4 }, (_, index) => candidate(index + 1)));
    const result = await cleanupCatalogImageCandidateOverCap(request, { repository, reject: rejectCatalogImageCandidate });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("candidate-");
    expect(serialized).not.toContain("external-");
    expect(serialized).not.toContain("alicdn");
    expect(serialized).not.toContain("sourceUrlHash");
    expect(serialized).not.toContain("matchEvidence");
  });
});
