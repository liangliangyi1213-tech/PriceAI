import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  approveCatalogImageCandidate,
  CatalogImageReviewError,
  promoteCatalogImagePrimary,
  rejectCatalogImageCandidate,
} from "./review-service";
import type {
  CatalogImageReviewContext,
  CatalogImageReviewRepository,
  PrimaryPromotionResult,
} from "./review-service";
import type { CatalogImage } from "./types";

const sourceUrl = "https://img.alicdn.com/xiaomi-15.jpg";
const evidence = {
  schemaVersion: 1,
  matcher: "taobao_phone_strict",
  matchLevel: "product",
  signals: ["brand", "model"],
};

function image(overrides: Partial<CatalogImage> = {}): CatalogImage {
  return {
    id: "image-1",
    productId: "xiaomi-15",
    variantId: null,
    targetType: "product",
    role: "gallery",
    status: "candidate",
    platform: "taobao",
    externalProductId: "tb-item",
    externalVariantId: null,
    sourceKind: "pict_url",
    sourceUrl,
    sourceHost: "img.alicdn.com",
    sourceUrlHash: createHash("sha256").update(sourceUrl).digest("hex"),
    matchConfidence: 1,
    matchEvidence: evidence,
    contentHash: null,
    storageBucket: null,
    storageObjectPath: null,
    verifiedAt: null,
    verifiedBy: null,
    verificationMethod: null,
    firstSeenAt: "2026-09-11T00:00:00.000Z",
    lastSeenAt: "2026-09-12T00:00:00.000Z",
    ...overrides,
  };
}

function context(overrides: Partial<CatalogImageReviewContext> = {}): CatalogImageReviewContext {
  return {
    image: image(),
    productExists: true,
    variantBelongsToProduct: true,
    ...overrides,
  };
}

describe("catalog image review service", () => {
  const getReviewContext = vi.fn();
  const approveCandidate = vi.fn();
  const rejectCandidate = vi.fn();
  const promotePrimary = vi.fn();
  const repository: CatalogImageReviewRepository = {
    getReviewContext,
    approveCandidate,
    rejectCandidate,
    promotePrimary,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getReviewContext.mockResolvedValue(context());
    approveCandidate.mockResolvedValue(image({
      status: "approved",
      verifiedAt: "2026-09-12T08:00:00.000Z",
    }));
    rejectCandidate.mockResolvedValue(undefined);
    promotePrimary.mockResolvedValue({
      imageId: "image-1",
      previousImageId: null,
      action: "initial",
      eventId: "event-1",
    } satisfies PrimaryPromotionResult);
  });

  it("approves a valid candidate with explicit reviewer metadata", async () => {
    const result = await approveCatalogImageCandidate({
      imageId: "image-1",
      reviewer: "catalog-reviewer",
      reviewMethod: "manual",
      verifiedAt: "2026-09-12T08:00:00.000Z",
    }, repository);

    expect(result.status).toBe("approved");
    expect(approveCandidate).toHaveBeenCalledWith({
      imageId: "image-1",
      reviewer: "catalog-reviewer",
      reviewMethod: "manual",
      verifiedAt: "2026-09-12T08:00:00.000Z",
      matchConfidence: 1,
      matchEvidence: evidence,
    });
    expect(rejectCandidate).not.toHaveBeenCalled();
  });

  it.each([
    ["source_identity_invalid", { sourceHost: "other.example" }],
    ["source_not_allowed", { sourceUrl: "http://img.alicdn.com/xiaomi-15.jpg" }],
    ["match_evidence_invalid", { matchEvidence: null }],
  ] as const)("rejects an invalid candidate with safe reason %s", async (reason, imageOverrides) => {
    getReviewContext.mockResolvedValue(context({ image: image(imageOverrides) }));

    await expect(approveCatalogImageCandidate({
      imageId: "image-1",
      reviewer: "catalog-reviewer",
      reviewMethod: "manual",
      verifiedAt: "2026-09-12T08:00:00.000Z",
    }, repository)).resolves.toEqual({ status: "rejected", reason });

    expect(rejectCandidate).toHaveBeenCalledWith({ imageId: "image-1", reason });
    expect(approveCandidate).not.toHaveBeenCalled();
  });

  it("rejects a Variant candidate whose target no longer belongs to the Product", async () => {
    getReviewContext.mockResolvedValue(context({
      image: image({
        variantId: "xiaomi-15-256-black",
        targetType: "variant",
        matchEvidence: { ...evidence, matchLevel: "variant", signals: ["brand", "model", "storage"] },
      }),
      variantBelongsToProduct: false,
    }));

    await expect(approveCatalogImageCandidate({
      imageId: "image-1",
      reviewer: "catalog-reviewer",
      reviewMethod: "manual",
    }, repository)).resolves.toEqual({ status: "rejected", reason: "target_invalid" });
    expect(approveCandidate).not.toHaveBeenCalled();
  });

  it("does not review an image that is no longer a candidate", async () => {
    getReviewContext.mockResolvedValue(context({ image: image({ status: "approved" }) }));

    await expect(approveCatalogImageCandidate({
      imageId: "image-1",
      reviewer: "catalog-reviewer",
      reviewMethod: "manual",
    }, repository)).rejects.toEqual(new CatalogImageReviewError("not_candidate"));
    expect(approveCandidate).not.toHaveBeenCalled();
    expect(rejectCandidate).not.toHaveBeenCalled();
  });

  it("manually rejects a current candidate with a required reason", async () => {
    await expect(rejectCatalogImageCandidate({
      imageId: "image-1",
      reviewer: "catalog-reviewer",
      reason: "wrong product identity",
    }, repository)).resolves.toBeUndefined();
    expect(rejectCandidate).toHaveBeenCalledWith({ imageId: "image-1", reason: "wrong product identity" });
  });

  it("does not manually reject a non-candidate or accept an empty reason", async () => {
    await expect(rejectCatalogImageCandidate({
      imageId: "image-1",
      reviewer: "catalog-reviewer",
      reason: "",
    }, repository)).rejects.toEqual(new CatalogImageReviewError("review_metadata_invalid"));
    getReviewContext.mockResolvedValue(context({ image: image({ status: "approved" }) }));
    await expect(rejectCatalogImageCandidate({
      imageId: "image-1",
      reviewer: "catalog-reviewer",
      reason: "reject approved image",
    }, repository)).rejects.toEqual(new CatalogImageReviewError("not_candidate"));
  });

  it.each(["initial", "replace", "rollback"] as const)(
    "delegates %s promotion to one atomic repository operation",
    async (action) => {
      getReviewContext.mockResolvedValue(context({ image: image({ status: "approved" }) }));
      promotePrimary.mockResolvedValue({
        imageId: "image-1",
        previousImageId: action === "initial" ? null : "image-old",
        action,
        eventId: `event-${action}`,
      });

      await expect(promoteCatalogImagePrimary({
        imageId: "image-1",
        action,
        reviewer: "catalog-reviewer",
        reason: `${action} reviewed image`,
      }, repository)).resolves.toEqual({
        imageId: "image-1",
        previousImageId: action === "initial" ? null : "image-old",
        action,
        eventId: `event-${action}`,
      });
      expect(promotePrimary).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["rejected", "unavailable", "candidate"] as const)(
    "does not promote a %s image",
    async (status) => {
      getReviewContext.mockResolvedValue(context({ image: image({ status }) }));

      await expect(promoteCatalogImagePrimary({
        imageId: "image-1",
        action: "initial",
        reviewer: "catalog-reviewer",
        reason: "set primary",
      }, repository)).rejects.toEqual(new CatalogImageReviewError("not_approved"));
      expect(promotePrimary).not.toHaveBeenCalled();
    },
  );

  it("keeps concurrent promotion decisions inside the atomic repository boundary", async () => {
    getReviewContext.mockResolvedValue(context({ image: image({ status: "approved" }) }));
    promotePrimary
      .mockResolvedValueOnce({ imageId: "image-1", previousImageId: null, action: "initial", eventId: "event-1" })
      .mockRejectedValueOnce(new CatalogImageReviewError("promotion_conflict"));

    const results = await Promise.allSettled([
      promoteCatalogImagePrimary({ imageId: "image-1", action: "initial", reviewer: "reviewer-a", reason: "first" }, repository),
      promoteCatalogImagePrimary({ imageId: "image-1", action: "initial", reviewer: "reviewer-b", reason: "second" }, repository),
    ]);

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(promotePrimary).toHaveBeenCalledTimes(2);
  });
});
